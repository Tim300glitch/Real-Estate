import Anthropic from "@anthropic-ai/sdk";
import { aiSchema } from "@/lib/schemas";
import { api } from "@/server/api";

// Optional AI assistant. The model receives ONLY the facts the app already
// holds (each with its source) and is instructed never to introduce new
// property facts. The UI renders the facts list separately from the
// model's interpretation, so the two can never be confused.

const SYSTEM = `You are an analyst assistant inside a real-estate wholesaling CRM.
Rules you must follow:
- Use ONLY the facts provided in <facts>. Never invent addresses, prices, owner details, dates, loan data, distress events or market statistics.
- If the facts are insufficient to answer, say exactly what data is missing.
- Treat estimates (AVM values, mortgage balances, equity, ARV, repair estimates) as estimates, never as confirmed facts.
- Every statement you make is an interpretation; keep it grounded and cite fact labels in square brackets, e.g. [Equity].
- Be concise: short bullet points, no preamble. For drafted messages, write plain, respectful, compliant outreach (no pressure tactics, no false urgency, no misrepresentation) and include an opt-out line for SMS.`;

const TASK_PROMPTS: Record<string, string> = {
  why_lead: "Explain why this property may or may not be a strong lead.",
  summarize_conversations: "Summarize the seller conversation history: motivation, timeline, objections, price expectations, next step.",
  explain_comps: "Explain the comparable sales and how they support (or undermine) the ARV.",
  suspicious_assumptions: "List assumptions in this analysis that look risky or inconsistent with the facts, and why.",
  draft_followup: "Draft a short, friendly follow-up message to the seller based on the conversation so far.",
  deal_summary: "Write a concise deal summary suitable for an internal deal review.",
  analyze_rehab: "Review the repair estimate: missing categories, items that look high/low relative to the property facts, risks.",
  prioritize_leads: "Rank these leads for follow-up today and give a one-line reason for each.",
  ask: "Answer the user's question.",
};

export const POST = api({ permission: "ai:use", rpm: 20, schema: aiSchema }, async ({ input }) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { configured: false, interpretation: null };
  }
  const client = new Anthropic();
  const factsXml = input.facts.map((f) => `- ${f.label}: ${f.value} (source: ${f.source})`).join("\n");
  const userText = `<facts>\n${factsXml}\n</facts>\n\nTask: ${TASK_PROMPTS[input.task]}${input.question ? `\nUser question: ${input.question}` : ""}`;

  try {
    const response = await client.beta.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: userText }],
    });
    if (response.stop_reason === "refusal") {
      return { configured: true, interpretation: null, error: "The assistant declined this request." };
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { configured: true, interpretation: text, model: response.model };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return { configured: true, interpretation: null, error: "AI rate limit reached — try again shortly." };
    if (error instanceof Anthropic.AuthenticationError) return { configured: true, interpretation: null, error: "AI key rejected — check ANTHROPIC_API_KEY." };
    if (error instanceof Anthropic.APIError) return { configured: true, interpretation: null, error: `AI service error (${error.status}).` };
    throw error;
  }
});
