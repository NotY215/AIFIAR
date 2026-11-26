import type{ConnectorProfile}from"./protocol.js";
const tools=["aifiar_status","aifiar_list_models","aifiar_get_instructions","aifiar_prepare_repository"];
export const CONNECTOR_PROFILES:Readonly<Record<string,ConnectorProfile>>={
claude:{id:"claude",displayName:"AIFIAR for Claude",hostType:"mcp-local",description:"Local MCP tools for Claude Desktop.",tools,status:"supported"},
gpt:{id:"gpt",displayName:"AIFIAR for ChatGPT",hostType:"mcp-remote-required",description:"ChatGPT custom MCP app profile; requires remote HTTPS hosting and host-approved authentication.",tools,status:"requires-remote-host"},
grok:{id:"grok",displayName:"AIFIAR for Grok",hostType:"mcp-compatibility",description:"Compatibility profile for an MCP-capable xAI host or bridge; native Grok MCP support is not assumed.",tools,status:"compatibility-unverified"},
codex:{id:"codex",displayName:"AIFIAR for Codex",hostType:"mcp-local",description:"Local stdio MCP tools for Codex.",tools,status:"supported"},
cursor:{id:"cursor",displayName:"AIFIAR for Cursor",hostType:"mcp-local",description:"Local stdio MCP tools for Cursor.",tools,status:"supported"}};
export function getConnectorProfile(id:string):ConnectorProfile{const p=CONNECTOR_PROFILES[id.toLowerCase()];if(!p)throw new Error("Unknown connector profile. Choose claude, gpt, grok, codex, or cursor.");return p;}