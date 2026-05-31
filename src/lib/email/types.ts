export type EmailAddress = string;
export type EmailTemplateName = string;

export type SendResult = {
  success: boolean;
  messageId?: string;
  info?: unknown;
};
