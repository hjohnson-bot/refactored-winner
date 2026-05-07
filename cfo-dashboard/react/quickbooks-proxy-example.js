/**
 * Optional: server-side proxy that the React component's `Refresh from QB`
 * button can call to trigger a live QuickBooks pull on demand.
 *
 * Why this is needed: the browser cannot call api.anthropic.com directly
 * (CORS, no API key). And QuickBooks MCP requires Intuit OAuth, which must
 * happen on a server you control.
 *
 * Drop this into a Next.js route, Vercel function, Express handler, etc.
 * Adjust the path / auth pattern to match your stack.
 *
 * Required environment variables:
 *   ANTHROPIC_API_KEY     - your Anthropic API key
 *   QB_MCP_URL            - the QuickBooks MCP server URL the user authenticated against
 *
 * The handler:
 *   1. Asks Claude to pull P&L + AR/AP/cash from QB via MCP.
 *   2. Parses the structured JSON Claude returns.
 *   3. Writes the result back to disk as data/snapshot.json (optional).
 *   4. Returns the same { months, meta } shape the snapshotAdapter produces.
 *
 * Once mounted, point the React component at it:
 *
 *     <CFODashboard refreshUrl="/api/refresh-quickbooks" />
 */

// Minimal Vercel/Next.js style handler. Adapt as needed.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const qbMcpUrl = process.env.QB_MCP_URL;
  if (!apiKey || !qbMcpUrl) {
    return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY or QB_MCP_URL" });
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "mcp-client-2025-04-04",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4000,
        system:
          "You are a data extraction assistant. Pull QuickBooks Profit & Loss for the last 24 months " +
          "with monthly detail, plus current AR, AP, and cash balances. Return ONLY valid JSON, no markdown, " +
          "no backticks, no explanation. Shape: " +
          '{ "months": { "YYYY-MM": { "revenue": number, "cogs": number, "grossProfit": number, ' +
          '"opex": number, "netIncome": number, "ar": number, "ap": number, "cash": number } } }',
        messages: [{
          role: "user",
          content: "Pull my Profit and Loss report from QuickBooks for the last 24 months with monthly detail. " +
                   "Include current AR, AP, and cash. Return as the JSON shape described in the system prompt.",
        }],
        mcp_servers: [{ type: "url", url: qbMcpUrl, name: "quickbooks" }],
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ error: `Anthropic API ${r.status}: ${text}` });
    }
    const data = await r.json();

    // Pull the JSON out of whatever combination of text + tool_use blocks Claude returned
    const blocks = data.content || [];
    const textBlocks = blocks.filter(b => b.type === "text").map(b => b.text || "").join("\n");
    const toolResults = blocks
      .filter(b => b.type === "mcp_tool_result")
      .map(b => (b.content?.[0]?.text || ""))
      .join("\n");
    const combined = textBlocks + "\n" + toolResults;

    const match = combined.match(/\{[\s\S]*"months"[\s\S]*\}/);
    if (!match) {
      return res.status(502).json({ error: "Claude response did not include a months JSON block", raw: combined.slice(0, 2000) });
    }
    const parsed = JSON.parse(match[0]);
    if (!parsed.months) return res.status(502).json({ error: "Parsed JSON has no `months` field" });

    return res.status(200).json({
      months: parsed.months,
      meta: {
        source: "QuickBooks Online (live, via Anthropic MCP)",
        generatedAt: new Date().toISOString(),
        asOf: new Date().toISOString().slice(0, 10),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Unknown error" });
  }
}
