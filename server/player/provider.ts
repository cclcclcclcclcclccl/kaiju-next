export type ProviderConfig = { baseUrl: string; key: string; model: string };
export function providerConfig(): ProviderConfig | null {
  const { MODEL_BASE_URL, MODEL_API_KEY, MODEL_NAME } = process.env;
  if (!MODEL_BASE_URL || !MODEL_API_KEY || !MODEL_NAME) return null;
  return { baseUrl: MODEL_BASE_URL, key: MODEL_API_KEY, model: MODEL_NAME };
}
