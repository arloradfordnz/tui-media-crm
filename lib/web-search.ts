import type Anthropic from '@anthropic-ai/sdk'

// Anthropic's server-side web search, for Tui. It runs on Anthropic's side
// inside the same API call: there is no executor for it in ai-tools.ts, and the
// results come back as server_tool_use / web_search_tool_result blocks in the
// response rather than as a tool_use round.
//
// What it's for is in assistant-persona.ts (WEB_SEARCH): looking up clients
// and leads when Arlo asks, never on Tui's own initiative.

// Results ranked for where the business actually is, so "Johnson Residential"
// finds the Nelson builder before a namesake overseas.
const USER_LOCATION = {
  type: 'approximate',
  city: 'Nelson',
  region: 'Nelson',
  country: 'NZ',
  timezone: 'Pacific/Auckland',
} as const

// A cap per request, so one vague question can't run up a pile of searches.
const MAX_USES = 5

/** For Sonnet 5 and newer (the Telegram agent): the dynamic-filtering variant. */
export const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20260209 = {
  type: 'web_search_20260209',
  name: 'web_search',
  max_uses: MAX_USES,
  user_location: USER_LOCATION,
}

/** For Haiku 4.5 (the dashboard panel), which only takes the basic variant. */
export const WEB_SEARCH_TOOL_BASIC: Anthropic.WebSearchTool20250305 = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: MAX_USES,
  user_location: USER_LOCATION,
}
