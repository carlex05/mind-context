export type LlmRole = "system" | "user" | "assistant";

export interface LlmMessage {
  readonly role: LlmRole;
  readonly content: string;
}

export interface LlmRequest {
  readonly model?: string;
  readonly messages: readonly LlmMessage[];
}

export interface LlmResponse {
  readonly content: string;
  readonly model?: string;
}

export interface LlmProviderCapabilities {
  readonly tools: boolean;
  readonly vision: boolean;
  readonly embeddings: boolean;
}

export interface LlmProvider {
  readonly id: string;

  capabilities(): Promise<LlmProviderCapabilities>;
  listModels(): Promise<readonly string[]>;
  chat(request: LlmRequest): Promise<LlmResponse>;
}
