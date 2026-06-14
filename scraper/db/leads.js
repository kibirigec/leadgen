import { pool } from './pool.js';
import { logger } from '../utils/logger.js';

/**
 * Upsert a lead into the database.
 * Merging rules:
 * - If existing field is null and new value is not null -> update it
 * - Keep value from higher confidence source if both exist
 * - Append to all_emails and email_sources
 */
export async function upsertLead(leadData) {
  const dedupKey = leadData.dedup_key;
  if (!dedupKey) {
    logger.warn('Attempted to upsert lead without dedup_key', leadData);
    return false;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingRes = await client.query('SELECT * FROM leads WHERE dedup_key = $1 FOR UPDATE', [dedupKey]);
    
    if (existingRes.rows.length === 0) {
      // INSERT
      const cols = Object.keys(leadData);
      const vals = Object.values(leadData);
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
      
      const insertQuery = `
        INSERT INTO leads (${cols.join(', ')})
        VALUES (${placeholders})
        RETURNING id;
      `;
      
      await client.query(insertQuery, vals);
      await client.query('COMMIT');
      return { action: 'inserted' };
    } else {
      // UPDATE (Merge)
      const existing = existingRes.rows[0];
      const updates = {};
      
      for (const [key, val] of Object.entries(leadData)) {
        if (key === 'dedup_key') continue;
        
        if (val === null || val === undefined) continue;

        // Array merging
        if (Array.isArray(val) && Array.isArray(existing[key])) {
          updates[key] = Array.from(new Set([...existing[key], ...val]));
          continue;
        }

        // Overwrite rules:
        // - If existing is null/empty
        // - If higher confidence source (would need complex logic here, for now overwrite if new is better or existing is null)
        if (existing[key] === null || existing[key] === undefined || existing[key] === '') {
          updates[key] = val;
        } else if (key === 'lead_score' && val > existing[key]) {
          updates[key] = val;
        } else if (key === 'website_quality' && val !== 'none') {
           updates[key] = val; // Has booking > broken > none
        }
      }

      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
        const updateVals = Object.values(updates);
        
        await client.query(`
          UPDATE leads 
          SET ${setClauses}
          WHERE dedup_key = $1
        `, [dedupKey, ...updateVals]);
      }
      
      await client.query('COMMIT');
      return { action: 'updated' };
    }
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error({ err: error, dedup_key: dedupKey }, 'Failed to upsert lead');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get leads ready for outreach.
 */
export async function getLeadsForOutreach(options = {}) {
  const minScore = options.minScore || 0;
  const state = options.state;
  const emailOnly = options.emailOnly || false;
  const limit = options.limit || 100;
  
  let query = `
    SELECT * FROM leads 
    WHERE scrape_status != 'filtered_out' 
      AND outreach_status = 'new'
      AND lead_score >= $1
  `;
  
  const params = [minScore];
  let paramCount = 1;
  
  if (state) {
    paramCount++;
    query += ` AND state = $${paramCount}`;
    params.push(state);
  }
  
  if (emailOnly) {
    query += ` AND email IS NOT NULL`;
  }
  
  paramCount++;
  query += ` ORDER BY lead_score DESC, id ASC LIMIT $${paramCount}`;
  params.push(limit);
  
  const res = await pool.query(query, params);
  return res.rows;
}

/**
 * Update outreach status.
 */
export async function updateOutreachStatus(dedup_key, status) {
  const allowedStatuses = ['new', 'contacted', 'responded', 'converted', 'dead'];
  if (!allowedStatuses.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  
  await pool.query(`
    UPDATE leads 
    SET outreach_status = $1, updated_at = NOW() 
    WHERE dedup_key = $2
  `, [status, dedup_key]);
}

/**
 * Get general database stats.
 */
export async function getStats() {
  const res = await pool.query(`
    SELECT 
      COUNT(*) as total_leads,
      COUNT(NULLIF(scrape_status != 'filtered_out', false)) as passed_filter,
      COUNT(NULLIF(scrape_status = 'filtered_out', false)) as filtered_out,
      COUNT(email) as with_email,
      COUNT(phone) as with_phone
    FROM leads
  `);
  
  return {
    total_leads: parseInt(res.rows[0].total_leads, 10),
    passed_filter: parseInt(res.rows[0].passed_filter, 10),
    filtered_out: parseInt(res.rows[0].filtered_out, 10),
    with_email: parseInt(res.rows[0].with_email, 10),
    with_phone: parseInt(res.rows[0].with_phone, 10)
  };
}
