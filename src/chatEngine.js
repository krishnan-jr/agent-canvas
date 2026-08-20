/**
 * AI Copilot Chat & Autonomous Multi-Agent Generation Engine
 * Dynamically scans .env for configured LLM providers (Gemini, Claude, OpenAI, OpenRouter, Ollama, LM Studio),
 * parses custom multi-model lists per provider, and executes autonomous MCP tool calling.
 */

import fs from 'node:fs';
import path from 'node:path';
import { executeToolCall, MCP_TOOLS } from './mcpServer.js';
import { getNodesByProject, getEdgesByProject, getSkillsByProject, getProjectById } from './db.js';

/**
 * Loads .env dynamically so environment changes are reflected immediately
 */
export function loadEnvConfig() {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const k = trimmed.slice(0, eqIdx).trim();
          let v = trimmed.slice(eqIdx + 1).trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          if (v) {
            process.env[k] = v;
          }
        }
      }
    } catch (e) {}
  }
}

/**
 * Convert MCP Tool Schemas to provider-native formats
 */
export function getOpenAIToolSchemas() {
  return MCP_TOOLS.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema
    }
  }));
}

export function getAnthropicToolSchemas() {
  return MCP_TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema
  }));
}

export function getGeminiToolDeclarations() {
  const declarations = MCP_TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema
  }));
  return [{ functionDeclarations: declarations }];
}

/**
 * Builds the system instructions for the Canvas AI Copilot
 */
export function buildCopilotSystemPrompt(projectId) {
  const project = getProjectById(projectId);
  const nodes = getNodesByProject(projectId);
  const edges = getEdgesByProject(projectId);
  const skills = getSkillsByProject(projectId);

  return `You are the Agent Canvas AI Copilot & Multi-Agent Architect.
Your role is to assist developers in designing, generating, refactoring, wiring, and auditing autonomous multi-agent pipelines and workflows.

You have access to 25 autonomous MCP tools to directly inspect and mutate the canvas graph:
- Agent Blocks: create_agent, update_agent, delete_agent, get_agent, list_agents
- Connections & Routing: create_edge, update_edge, delete_edge, auto_layout_graph
- Modular Skills: create_skill, delete_skill, list_skills, get_skill
- Quality & Transpilation: lint_graph, run_workflow, export_workflow, list_projects, create_project

CURRENT PROJECT CONTEXT:
- Project: "${project ? project.name : projectId}" (ID: ${projectId})
- Active Agents (${nodes.length}): ${nodes.map(n => `${n.filename} [role: ${n.role || 'assistant'}]`).join(', ') || 'None'}
- Active Connections (${edges.length}): ${edges.map(e => {
    const src = nodes.find(n => n.id === e.source_id);
    const tgt = nodes.find(n => n.id === e.target_id);
    return `${src?.filename || e.source_id} -> ${tgt?.filename || e.target_id} [${e.condition || e.edge_type || 'next'}]`;
  }).join(', ') || 'None'}
- Linked Skills (${skills.length}): ${skills.map(s => s.name).join(', ') || 'None'}

UNIVERSAL AGENT MARKDOWN SCHEMA RULES:
1. Every agent block MUST have valid YAML frontmatter between --- lines with:
   - name: <slug>
   - role: orchestrator | researcher | evaluator | coder | router | assistant | tool
   - description: "<capability statement>"
   - tools: [array of permitted tools]
   - skills: [array of linked skill names]
   - routes: array of conditional edges ({ on: pass | reject | fail | start, target: <agent>.md, label: "<Label>" })
   - temperature: 0.0 to 1.0 (default 0.2)
2. NEVER include hardcoded model names in the agent frontmatter or body text (models are configured at runtime).
3. Strictly follow the No Emojis Policy in markdown files, descriptions, and edge labels.
4. When asked to generate a workflow, squad, or pipeline:
   - Create all necessary agent blocks using create_agent with comprehensive, professional instructions.
   - Wire appropriate forward (PASS / START) and feedback loop (REJECT / FAIL) edges using create_edge.
   - Create any necessary domain skills using create_skill.
   - Call auto_layout_graph to organize the canvas nicely.
   - Call lint_graph to verify 0 errors.
   - Provide a clear, concise summary of the architecture created.`;
}

/**
 * Dynamically scan .env and process.env for actively configured LLM providers and model lists
 */
export function getAvailableProviders() {
  loadEnvConfig();
  const providers = [];

  const parseModels = (envVar, fallbackList) => {
    const val = process.env[envVar];
    if (val && typeof val === 'string') {
      const parsed = val.split(',').map(m => m.trim()).filter(Boolean);
      if (parsed.length > 0) return parsed;
    }
    return fallbackList;
  };

  // 1. Google Gemini
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    const models = parseModels('GEMINI_MODELS', ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.7-flash', 'gemini-3.7-pro']);
    providers.push({
      id: 'gemini',
      name: 'Google Gemini',
      models,
      defaultModel: models[0],
      configured: true
    });
  }

  // 2. Anthropic Claude
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim()) {
    const models = parseModels('ANTHROPIC_MODELS', ['claude-3-7-sonnet', 'claude-3-5-sonnet', 'claude-3-5-haiku']);
    providers.push({
      id: 'anthropic',
      name: 'Anthropic Claude',
      models,
      defaultModel: models[0],
      configured: true
    });
  }

  // 3. OpenAI
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) {
    const models = parseModels('OPENAI_MODELS', ['gpt-4o', 'gpt-4o-mini', 'o3-mini']);
    providers.push({
      id: 'openai',
      name: 'OpenAI',
      models,
      defaultModel: models[0],
      configured: true
    });
  }

  // 4. OpenRouter
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim()) {
    const models = parseModels('OPENROUTER_MODELS', ['anthropic/claude-3.7-sonnet', 'google/gemini-2.5-pro', 'openai/gpt-4o']);
    providers.push({
      id: 'openrouter',
      name: 'OpenRouter',
      models,
      defaultModel: models[0],
      configured: true
    });
  }

  // 5. Ollama
  if (process.env.OLLAMA_BASE_URL && process.env.OLLAMA_BASE_URL.trim()) {
    const models = parseModels('OLLAMA_MODELS', ['llama3.3', 'qwen2.5-coder', 'deepseek-r1']);
    providers.push({
      id: 'ollama',
      name: 'Ollama (Local)',
      models,
      defaultModel: models[0],
      configured: true,
      baseUrl: process.env.OLLAMA_BASE_URL.trim()
    });
  }

  // 6. LM Studio
  if (process.env.LM_STUDIO_BASE_URL && process.env.LM_STUDIO_BASE_URL.trim()) {
    const models = parseModels('LM_STUDIO_MODELS', ['local-model']);
    providers.push({
      id: 'lm_studio',
      name: 'LM Studio (Local)',
      models,
      defaultModel: models[0],
      configured: true,
      baseUrl: process.env.LM_STUDIO_BASE_URL.trim()
    });
  }

  // 7. vLLM / Custom LocalAI
  if (process.env.VLLM_BASE_URL && process.env.VLLM_BASE_URL.trim()) {
    const models = parseModels('VLLM_MODELS', ['vllm-model']);
    providers.push({
      id: 'vllm',
      name: 'vLLM (Local)',
      models,
      defaultModel: models[0],
      configured: true,
      baseUrl: process.env.VLLM_BASE_URL.trim()
    });
  }

  return providers;
}

/**
 * OpenAI / OpenRouter / Ollama / LM Studio streaming implementation
 */
export async function* streamOpenAIChat(projectId, messages, model, endpoint, apiKey, onEvent) {
  const tools = getOpenAIToolSchemas();
  const systemPrompt = buildCopilotSystemPrompt(projectId);

  const formattedMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];

  try {
    let loopCount = 0;
    const maxLoops = 6;

    while (loopCount < maxLoops) {
      loopCount++;

      const res = await fetch(`${endpoint.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({
          model: model || 'gpt-4o',
          messages: formattedMessages,
          tools: tools,
          tool_choice: 'auto',
          stream: true
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        yield `\n*LLM API Error (${res.status}): ${errText}*\n`;
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let toolCallsAcc = [];
      let currentAssistantMessage = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const delta = data.choices?.[0]?.delta;
              if (!delta) continue;

              if (delta.content) {
                currentAssistantMessage += delta.content;
                yield delta.content;
              }

              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index || 0;
                  if (!toolCallsAcc[idx]) {
                    toolCallsAcc[idx] = {
                      id: tc.id || `call_${Date.now()}_${idx}`,
                      type: 'function',
                      function: { name: tc.function?.name || '', arguments: '' }
                    };
                  }
                  if (tc.function?.name) toolCallsAcc[idx].function.name = tc.function.name;
                  if (tc.function?.arguments) toolCallsAcc[idx].function.arguments += tc.function.arguments;
                }
              }
            } catch (err) {}
          }
        }
      }

      if (toolCallsAcc.length === 0) {
        break;
      }

      formattedMessages.push({
        role: 'assistant',
        content: currentAssistantMessage || null,
        tool_calls: toolCallsAcc
      });

      for (const tc of toolCallsAcc) {
        const toolName = tc.function.name;
        let toolArgs = {};
        try {
          toolArgs = JSON.parse(tc.function.arguments || '{}');
        } catch (e) {
          toolArgs = {};
        }

        if (!toolArgs.projectId) toolArgs.projectId = projectId;

        onEvent('tool_start', { tool: toolName, args: toolArgs });
        const toolResult = await executeToolCall(toolName, toolArgs);
        onEvent('tool_result', { tool: toolName, result: toolResult });
        onEvent('canvas_sync', { projectId });

        formattedMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: toolName,
          content: JSON.stringify(toolResult)
        });
      }

      toolCallsAcc = [];
    }
  } catch (err) {
    yield `\n*Connection error: ${err.message}*\n`;
  }
}

/**
 * Anthropic Claude streaming implementation
 */
export async function* streamAnthropicChat(projectId, messages, model, apiKey, baseUrl, onEvent) {
  const tools = getAnthropicToolSchemas();
  const systemPrompt = buildCopilotSystemPrompt(projectId);
  const endpoint = `${(baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '')}/messages`;

  const formattedMessages = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content
  }));

  try {
    let loopCount = 0;
    const maxLoops = 6;

    while (loopCount < maxLoops) {
      loopCount++;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: model || 'claude-3-7-sonnet',
          system: systemPrompt,
          messages: formattedMessages,
          tools: tools,
          max_tokens: 4096
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        yield `\n*Anthropic API Error (${res.status}): ${errText}*\n`;
        return;
      }

      const data = await res.json();
      const contentBlocks = data.content || [];
      const toolUseBlocks = contentBlocks.filter(b => b.type === 'tool_use');
      const textBlocks = contentBlocks.filter(b => b.type === 'text');

      for (const tb of textBlocks) {
        yield tb.text;
      }

      if (toolUseBlocks.length === 0) {
        break;
      }

      formattedMessages.push({
        role: 'assistant',
        content: contentBlocks
      });

      const toolResults = [];
      for (const tu of toolUseBlocks) {
        const toolName = tu.name;
        const toolArgs = tu.input || {};
        if (!toolArgs.projectId) toolArgs.projectId = projectId;

        onEvent('tool_start', { tool: toolName, args: toolArgs });
        const result = await executeToolCall(toolName, toolArgs);
        onEvent('tool_result', { tool: toolName, result });
        onEvent('canvas_sync', { projectId });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result)
        });
      }

      formattedMessages.push({
        role: 'user',
        content: toolResults
      });
    }
  } catch (err) {
    yield `\n*Anthropic connection error: ${err.message}*\n`;
  }
}

/**
 * Google Gemini streaming implementation
 */
export async function* streamGeminiChat(projectId, messages, model, apiKey, baseUrl, onEvent) {
  const tools = getGeminiToolDeclarations();
  const systemPrompt = buildCopilotSystemPrompt(projectId);
  const targetModel = model || 'gemini-2.5-flash';
  const endpoint = `${(baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '')}/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;

  const contents = [
    { role: 'user', parts: [{ text: `SYSTEM DIRECTIVE:\n${systemPrompt}` }] },
    { role: 'model', parts: [{ text: 'Understood. I am ready to design and mutate the multi-agent canvas graph.' }] },
    ...messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }))
  ];

  try {
    let loopCount = 0;
    const maxLoops = 6;

    while (loopCount < maxLoops) {
      loopCount++;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          tools: tools
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        yield `\n*Gemini API Error (${res.status}): ${errText}*\n`;
        return;
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];
      if (!candidate) break;

      const parts = candidate.content?.parts || [];
      const functionCalls = parts.filter(p => p.functionCall);
      const textParts = parts.filter(p => p.text);

      for (const tp of textParts) {
        yield tp.text;
      }

      if (functionCalls.length === 0) {
        break;
      }

      contents.push(candidate.content);

      const responseParts = [];
      for (const fc of functionCalls) {
        const toolName = fc.functionCall.name;
        const toolArgs = fc.functionCall.args || {};
        if (!toolArgs.projectId) toolArgs.projectId = projectId;

        onEvent('tool_start', { tool: toolName, args: toolArgs });
        const result = await executeToolCall(toolName, toolArgs);
        onEvent('tool_result', { tool: toolName, result });
        onEvent('canvas_sync', { projectId });

        responseParts.push({
          functionResponse: {
            name: toolName,
            response: { output: result }
          }
        });
      }

      contents.push({
        role: 'user',
        parts: responseParts
      });
    }
  } catch (err) {
    yield `\n*Gemini connection error: ${err.message}*\n`;
  }
}

/**
 * Main Chat Copilot dispatcher
 */
export async function* streamChatCopilot(projectId, messages, options = {}, onEvent = () => {}) {
  loadEnvConfig();
  const providers = getAvailableProviders();
  const { provider, model } = options;

  // 1. If NO providers are configured in .env, yield a clean notice
  if (providers.length === 0) {
    yield `### No AI Model Configured\n\n`;
    yield `To use the AI Copilot, configure your API key in the \`.env\` file in the project root:\n\n`;
    yield `\`\`\`bash\n# In .env:\nGEMINI_API_KEY=your_gemini_api_key_here\n# or\nANTHROPIC_API_KEY=your_anthropic_api_key_here\n# or\nOPENAI_API_KEY=your_openai_api_key_here\n\`\`\`\n\n`;
    yield `You can also customize multiple model names per provider, e.g.:\n`;
    yield `\`\`\`bash\nGEMINI_MODELS=gemini-2.5-flash,gemini-2.5-pro,gemini-3.7-flash\nANTHROPIC_MODELS=claude-3-7-sonnet,claude-3-5-sonnet\nOPENAI_MODELS=gpt-4o,gpt-4o-mini\n\`\`\`\n`;
    return;
  }

  // Resolve selected provider
  const activeProv = providers.find(p => p.id === provider) || providers[0];
  const activeModel = model || activeProv.defaultModel || activeProv.models[0];

  if (activeProv.id === 'gemini') {
    yield* streamGeminiChat(projectId, messages, activeModel, process.env.GEMINI_API_KEY, process.env.GEMINI_BASE_URL, onEvent);
    return;
  }

  if (activeProv.id === 'anthropic') {
    yield* streamAnthropicChat(projectId, messages, activeModel, process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_BASE_URL, onEvent);
    return;
  }

  if (activeProv.id === 'openai') {
    const endpoint = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    yield* streamOpenAIChat(projectId, messages, activeModel, endpoint, process.env.OPENAI_API_KEY, onEvent);
    return;
  }

  if (activeProv.id === 'openrouter') {
    const endpoint = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    yield* streamOpenAIChat(projectId, messages, activeModel, endpoint, process.env.OPENROUTER_API_KEY, onEvent);
    return;
  }

  if (activeProv.id === 'ollama') {
    const endpoint = (activeProv.baseUrl || 'http://localhost:11434').replace(/\/+$/, '') + '/v1';
    yield* streamOpenAIChat(projectId, messages, activeModel, endpoint, null, onEvent);
    return;
  }

  if (activeProv.id === 'lm_studio' || activeProv.id === 'vllm') {
    const endpoint = activeProv.baseUrl;
    yield* streamOpenAIChat(projectId, messages, activeModel, endpoint, null, onEvent);
    return;
  }

  yield `*Unknown provider: ${activeProv.id}*`;
}
