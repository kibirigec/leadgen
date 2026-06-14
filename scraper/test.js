import { runScraper, getStats, getLeadsForOutreach } from './index.js';

async function main() {
  console.log("🚀 Starting Local Test Run (Dry Run)...");
  
  const result = await runScraper({
    targets: [
      { source: 'google_maps', query: 'bed and breakfast Austin Texas' }
    ],
    maxResultsPerTarget: 5,
    dryRun: true,
    skipEnrichment: true // Keep it fast for quick tests
  });

  console.log("\n📊 RUN SUMMARY");
  console.table([{
    'Total Found': result.total_found,
    'Passed Filter': result.passed_filter,
    'Filtered Out': result.filtered_out,
    'With Email': result.with_email,
    'Duration (s)': (result.duration_ms / 1000).toFixed(2)
  }]);

  if (result.top_leads.length > 0) {
    console.log("\n🏆 TOP LEADS (Preview)");
    const preview = result.top_leads.map(l => ({
      Name: l.business_name,
      Phone: l.phone,
      Quality: l.website_quality,
      Score: l.lead_score
    }));
    console.table(preview);
  } else {
    console.log("\n⚠️ No leads passed the filters.");
  }
}

main().catch(console.error);
