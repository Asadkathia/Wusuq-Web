// Webhook bodies are provider-specific; we accept arbitrary JSON and let the
// active PaymentProvider.verifyCallback validate signature + shape.
export type WebhookPayload = Record<string, unknown>;
