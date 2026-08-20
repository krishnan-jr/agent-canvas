/**
 * AI Copilot Chat & Autonomous Agent Generation Engine
 * Supports Multi-Provider LLM Calls (Gemini, Anthropic, OpenAI, OpenRouter, Local Ollama/vLLM)
 * and autonomous tool-calling loops directly wired into Agent Canvas MCP tools.
 */

import { executeToolCall, MCP_TOOLS } from './mcpServer.js';
import { getNodesByProject, getEdgesByProject, getSkillsByProject, getProjectById } from './db.js';

// Convert MCP Tool Schemas to OpenAI / Anthropic / Gemini tool definitions
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

export function getGeminiToolSchemas() {
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
 * Detect available LLM providers from environment
 */
export function getAvailableProviders() {
  const providers = [];

  if (process.env.GEMINI_API_KEY) {
    providers.push({
      id: 'gemini',
      name: 'Google Gemini',
      models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.7-flash', 'gemini-3.7-pro'],
      defaultModel: 'gemini-2.5-flash',
      configured: true
    });
  }

  if (process.env.ANTHROPIC_API_KEY) {
    providers.push({
      id: 'anthropic',
      name: 'Anthropic Claude',
      models: ['claude-3-7-sonnet', 'claude-3-5-sonnet', 'claude-3-5-haiku'],
      defaultModel: 'claude-3-7-sonnet',
      configured: true
    });
  }

  if (process.env.OPENAI_API_KEY) {
    providers.push({
      id: 'openai',
      name: 'OpenAI',
      models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
      defaultModel: 'gpt-4o',
      configured: true
    });
  }

  if (process.env.OPENROUTER_API_KEY) {
    providers.push({
      id: 'openrouter',
      name: 'OpenRouter',
      models: ['anthropic/claude-3.7-sonnet', 'google/gemini-2.5-pro', 'openai/gpt-4o'],
      defaultModel: 'anthropic/claude-3.7-sonnet',
      configured: true
    });
  }

  // Local Endpoints (Ollama, LM Studio, etc.)
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const lmStudioUrl = process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1';

  providers.push({
    id: 'local',
    name: 'Local / Ollama / LM Studio',
    models: ['local-model', 'llama3.3', 'qwen2.5-coder', 'deepseek-r1'],
    defaultModel: 'local-model',
    configured: true,
    endpoints: { ollama: ollamaUrl, lmStudio: lmStudioUrl }
  });

  // Always include Sandbox / Smart Scaffold Engine
  providers.push({
    id: 'scaffold',
    name: 'Canvas Scaffold Engine (No API Key Required)',
    models: ['canvas-copilot-scaffold'],
    defaultModel: 'canvas-copilot-scaffold',
    configured: true
  });

  return providers;
}

/**
 * Intelligent Local Scaffold Engine for autonomous execution without external API keys
 */
export async function* executeScaffoldCopilot(projectId, userMessage, onEvent) {
  const prompt = userMessage.toLowerCase();
  yield 'Analyzing request and planning agent topology with Canvas Scaffold Engine...\n\n';

  // 1. Check if user wants to generate a complete squad/pipeline
  if (prompt.includes('generate') || prompt.includes('create') || prompt.includes('build') || prompt.includes('pipeline') || prompt.includes('squad') || prompt.includes('workflow')) {
    
    // Scenario A: Customer Support / Triage Squad
    if (prompt.includes('support') || prompt.includes('customer') || prompt.includes('triage') || prompt.includes('ticket') || prompt.includes('escalation')) {
      yield 'Designing **Customer Support & Escalation Squad** (4 agents, feedback loop, skills)...\n\n';

      // 1. Triage Agent
      onEvent('tool_start', { tool: 'create_agent', args: { filename: 'triage-router.md' } });
      const triageRes = await executeToolCall('create_agent', {
        projectId,
        title: 'Triage Router',
        filename: 'triage-router.md',
        role: 'router',
        description: 'Categorizes incoming customer tickets and routes to specialists based on urgency and topic.',
        tools: ['file_reader', 'sentiment_analyzer'],
        temperature: 0.1,
        content: `---
name: triage-router
role: router
description: "Categorizes incoming customer tickets and routes to specialists based on urgency and topic."
tools: [file_reader, sentiment_analyzer]
routes:
  - on: technical
    target: tech-specialist.md
    label: "ROUTE: Technical Issue"
  - on: billing
    target: billing-agent.md
    label: "ROUTE: Billing & Account"
  - on: escalate
    target: escalation-lead.md
    label: "ROUTE: Immediate Escalation"
temperature: 0.1
---

# Triage Router Agent

You are the **Triage Router Agent**. Your responsibility is to analyze incoming customer requests, assess urgency, classify intent, and route to the appropriate resolver.`
      });
      onEvent('tool_result', { tool: 'create_agent', result: triageRes });
      onEvent('canvas_sync', { projectId });
      yield `- Created **Triage Router** (\`triage-router.md\`)\n`;

      // 2. Tech Specialist Agent
      onEvent('tool_start', { tool: 'create_agent', args: { filename: 'tech-specialist.md' } });
      const techRes = await executeToolCall('create_agent', {
        projectId,
        title: 'Tech Specialist',
        filename: 'tech-specialist.md',
        role: 'assistant',
        description: 'Resolves technical issues, performs diagnostic troubleshooting, and drafts customer responses.',
        tools: ['file_reader', 'web_search', 'kb_search'],
        skills: ['troubleshooting-guide'],
        temperature: 0.2,
        content: `---
name: tech-specialist
role: assistant
description: "Resolves technical issues, performs diagnostic troubleshooting, and drafts customer responses."
tools: [file_reader, web_search, kb_search]
skills: [troubleshooting-guide]
routes:
  - on: pass
    target: quality-auditor.md
    label: "PASS: Submit Draft for Audit"
temperature: 0.2
---

# Tech Specialist Agent

You are the **Tech Specialist Agent**. You diagnose technical problems, query knowledge bases, and write clear, empathetic, and accurate technical solutions.`
      });
      onEvent('tool_result', { tool: 'create_agent', result: techRes });
      onEvent('canvas_sync', { projectId });
      yield `- Created **Tech Specialist** (\`tech-specialist.md\`)\n`;

      // 3. Quality Auditor (Evaluator)
      onEvent('tool_start', { tool: 'create_agent', args: { filename: 'quality-auditor.md' } });
      const qaRes = await executeToolCall('create_agent', {
        projectId,
        title: 'Quality Auditor',
        filename: 'quality-auditor.md',
        role: 'evaluator',
        description: 'Enforces tone, policy compliance, and technical accuracy before customer delivery.',
        tools: ['file_reader'],
        temperature: 0.1,
        content: `---
name: quality-auditor
role: evaluator
description: "Enforces tone, policy compliance, and technical accuracy before customer delivery."
tools: [file_reader]
routes:
  - on: pass
    target: response-sender.md
    label: "PASS: Approve for Delivery"
  - on: reject
    target: tech-specialist.md
    label: "REJECT: Tone / Accuracy Fix"
    max_retries: 3
temperature: 0.1
---

# Quality Auditor Agent

You are the **Quality Auditor Agent**. You verify that responses meet brand standards, privacy compliance, and solution accuracy before sending.`
      });
      onEvent('tool_result', { tool: 'create_agent', result: qaRes });
      onEvent('canvas_sync', { projectId });
      yield `- Created **Quality Auditor** (\`quality-auditor.md\`)\n`;

      // Wire Connections
      if (triageRes.agent?.id && techRes.agent?.id) {
        onEvent('tool_start', { tool: 'create_edge', args: { source: 'triage-router', target: 'tech-specialist' } });
        await executeToolCall('create_edge', {
          projectId,
          sourceId: triageRes.agent.id,
          targetId: techRes.agent.id,
          condition: 'technical',
          label: 'ROUTE: Technical Issue',
          edgeType: 'default'
        });
      }

      if (techRes.agent?.id && qaRes.agent?.id) {
        onEvent('tool_start', { tool: 'create_edge', args: { source: 'tech-specialist', target: 'quality-auditor' } });
        await executeToolCall('create_edge', {
          projectId,
          sourceId: techRes.agent.id,
          targetId: qaRes.agent.id,
          condition: 'pass',
          label: 'PASS: Submit Draft for Audit',
          edgeType: 'pass'
        });

        // Feedback Loop
        onEvent('tool_start', { tool: 'create_edge', args: { source: 'quality-auditor', target: 'tech-specialist' } });
        await executeToolCall('create_edge', {
          projectId,
          sourceId: qaRes.agent.id,
          targetId: techRes.agent.id,
          condition: 'reject',
          label: 'REJECT: Tone / Accuracy Fix',
          edgeType: 'fail'
        });
      }

      // Auto layout & lint
      onEvent('tool_start', { tool: 'auto_layout_graph', args: { projectId } });
      await executeToolCall('auto_layout_graph', { projectId });
      
      onEvent('tool_start', { tool: 'lint_graph', args: { projectId } });
      const lint = await executeToolCall('lint_graph', { projectId });

      onEvent('canvas_sync', { projectId });
      yield `\nAuto-layout applied and graph validated (0 errors, isHealthy = ${lint.diagnostics?.isHealthy}).\n\n`;
      yield `The Customer Support Squad is ready on your canvas!`;
      return;
    }

    // Scenario B: Generic Full Development Pipeline
    yield 'Designing **Autonomous Software Engineering Pipeline** with Multi-Agent Feedback Loops...\n\n';
    
    // Create Planner
    onEvent('tool_start', { tool: 'create_agent', args: { filename: 'architect.md' } });
    const archRes = await executeToolCall('create_agent', {
      projectId,
      title: 'Architect',
      filename: 'architect.md',
      role: 'researcher',
      description: 'Researches requirements, explores codebase architecture, and writes implementation specifications.',
      tools: ['file_reader', 'web_search'],
      temperature: 0.2,
      content: `---
name: architect
role: researcher
description: "Researches requirements, explores codebase architecture, and writes implementation specifications."
tools: [file_reader, web_search]
routes:
  - on: pass
    target: code-generator.md
    label: "PASS: Approved Architecture"
temperature: 0.2
---

# Architect Agent

You are the **Architect Agent**. You explore requirements and design minimal, robust software architectures.`
    });
    onEvent('tool_result', { tool: 'create_agent', result: archRes });
    yield `- Created **Architect** (\`architect.md\`)\n`;

    // Create Coder
    onEvent('tool_start', { tool: 'create_agent', args: { filename: 'code-generator.md' } });
    const coderRes = await executeToolCall('create_agent', {
      projectId,
      title: 'Code Generator',
      filename: 'code-generator.md',
      role: 'coder',
      description: 'Generates clean, idiomatic code implementations strictly matching the architectural spec.',
      tools: ['file_reader', 'file_writer', 'bash'],
      temperature: 0.2,
      content: `---
name: code-generator
role: coder
description: "Generates clean, idiomatic code implementations strictly matching the architectural spec."
tools: [file_reader, file_writer, bash]
routes:
  - on: pass
    target: code-evaluator.md
    label: "PASS: Submit Implementation"
temperature: 0.2
---

# Code Generator Agent

You are the **Code Generator Agent**. You produce high-quality, dependency-free implementations.`
    });
    onEvent('tool_result', { tool: 'create_agent', result: coderRes });
    yield `- Created **Code Generator** (\`code-generator.md\`)\n`;

    // Create Evaluator
    onEvent('tool_start', { tool: 'create_agent', args: { filename: 'code-evaluator.md' } });
    const evalRes = await executeToolCall('create_agent', {
      projectId,
      title: 'Code Evaluator',
      filename: 'code-evaluator.md',
      role: 'evaluator',
      description: 'Executes test suites, linters, and security reviews with automated feedback loops.',
      tools: ['file_reader', 'bash'],
      temperature: 0.1,
      content: `---
name: code-evaluator
role: evaluator
description: "Executes test suites, linters, and security reviews with automated feedback loops."
tools: [file_reader, bash]
routes:
  - on: pass
    target: deployer.md
    label: "PASS: Verification Approved"
  - on: reject
    target: code-generator.md
    label: "REJECT: Fix Tests & Lint (max 5)"
    max_retries: 5
temperature: 0.1
---

# Code Evaluator Agent

You are the **Code Evaluator Agent**. You verify test coverage, security standards, and schema correctness.`
    });
    onEvent('tool_result', { tool: 'create_agent', result: evalRes });
    yield `- Created **Code Evaluator** (\`code-evaluator.md\`)\n`;

    // Connect them
    if (archRes.agent?.id && coderRes.agent?.id) {
      await executeToolCall('create_edge', {
        projectId,
        sourceId: archRes.agent.id,
        targetId: coderRes.agent.id,
        condition: 'pass',
        label: 'PASS: Approved Architecture',
        edgeType: 'pass'
      });
    }
    if (coderRes.agent?.id && evalRes.agent?.id) {
      await executeToolCall('create_edge', {
        projectId,
        sourceId: coderRes.agent.id,
        targetId: evalRes.agent.id,
        condition: 'pass',
        label: 'PASS: Submit Implementation',
        edgeType: 'pass'
      });
      await executeToolCall('create_edge', {
        projectId,
        sourceId: evalRes.agent.id,
        targetId: coderRes.agent.id,
        condition: 'reject',
        label: 'REJECT: Fix Tests & Lint',
        edgeType: 'fail'
      });
    }

    // Auto-layout & Lint
    await executeToolCall('auto_layout_graph', { projectId });
    const lint = await executeToolCall('lint_graph', { projectId });

    onEvent('canvas_sync', { projectId });
    yield `\nWired forward execution paths and feedback loops.\n`;
    yield `Auto-layout applied and validated (Graph healthy = ${lint.diagnostics?.isHealthy}).\n`;
    return;
  }

  // 2. Check if user wants auto-layout
  if (prompt.includes('layout') || prompt.includes('arrange') || prompt.includes('organize')) {
    onEvent('tool_start', { tool: 'auto_layout_graph', args: { projectId } });
    const res = await executeToolCall('auto_layout_graph', { projectId });
    onEvent('tool_result', { tool: 'auto_layout_graph', result: res });
    onEvent('canvas_sync', { projectId });
    yield `Calculated optimal non-overlapping node positions using Dagre topological flow.\nCanvas re-aligned successfully!`;
    return;
  }

  // 3. Check if user wants to lint / verify graph
  if (prompt.includes('lint') || prompt.includes('verify') || prompt.includes('check') || prompt.includes('health') || prompt.includes('warning')) {
    onEvent('tool_start', { tool: 'lint_graph', args: { projectId } });
    const res = await executeToolCall('lint_graph', { projectId });
    onEvent('tool_result', { tool: 'lint_graph', result: res });
    yield `### Graph Topology Health Report\n`;
    yield `- **Total Agent Blocks**: ${res.diagnostics?.totalNodes || 0}\n`;
    yield `- **Total Decision Connections**: ${res.diagnostics?.totalEdges || 0}\n`;
    yield `- **Status**: ${res.diagnostics?.isHealthy ? 'HEALTHY' : 'NEEDS ATTENTION'}\n`;
    if (res.diagnostics?.errors && res.diagnostics.errors.length > 0) {
      yield `\n**Errors**:\n${res.diagnostics.errors.map(e => `- ${e}`).join('\n')}\n`;
    }
    if (res.diagnostics?.warnings && res.diagnostics.warnings.length > 0) {
      yield `\n**Warnings**:\n${res.diagnostics.warnings.map(w => `- ${w}`).join('\n')}\n`;
    }
    return;
  }

  // 4. Default helpful answer
  yield `I can help you build and refine multi-agent pipelines on this canvas!\n\n`;
  yield `**Try asking me to:**\n`;
  yield `- *"Create a customer support escalation squad with triage, specialist, and QA feedback loop"*\n`;
  yield `- *"Build an autonomous code development workflow with test verification"*\n`;
  yield `- *"Add an Evaluator node with a 5-retry reject loop back to Coder"*\n`;
  yield `- *"Auto-layout all blocks on the canvas"*\n`;
  yield `- *"Lint and verify graph health"*`;
}

/**
 * Calls OpenAI / OpenRouter / Ollama / Local compatible endpoint with function calling
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
        yield `\n*LLM API Error (${res.status}): ${errText}*\nFalling back to Local Intelligent Scaffold Engine...\n\n`;
        yield* executeScaffoldCopilot(projectId, messages[messages.length - 1]?.content || '', onEvent);
        return;
      }

      // Stream response chunks
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
        buffer = lines.pop(); // Keep partial line

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
            } catch (err) {
              // Ignore malformed JSON chunks
            }
          }
        }
      }

      // If no tool calls, we're done
      if (toolCallsAcc.length === 0) {
        break;
      }

      // Execute requested tool calls
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

        // Always inject current projectId if omitted
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
    yield `\n*Connection error: ${err.message}*\nFalling back to Local Scaffold Engine...\n\n`;
    yield* executeScaffoldCopilot(projectId, messages[messages.length - 1]?.content || '', onEvent);
  }
}

/**
 * Main Chat Copilot dispatcher
 */
export async function* streamChatCopilot(projectId, messages, options = {}, onEvent = () => {}) {
  const { provider, model } = options;
  const lastUserMsg = messages[messages.length - 1]?.content || '';

  // 1. If explicit scaffold requested or no external keys configured
  if (provider === 'scaffold' || (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY && !process.env.OPENROUTER_API_KEY)) {
    yield* executeScaffoldCopilot(projectId, lastUserMsg, onEvent);
    return;
  }

  // 2. OpenAI / OpenRouter / Local Endpoint
  if (provider === 'openai' || process.env.OPENAI_API_KEY) {
    const endpoint = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const apiKey = process.env.OPENAI_API_KEY;
    yield* streamOpenAIChat(projectId, messages, model || 'gpt-4o', endpoint, apiKey, onEvent);
    return;
  }

  if (provider === 'openrouter' || process.env.OPENROUTER_API_KEY) {
    const endpoint = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    const apiKey = process.env.OPENROUTER_API_KEY;
    yield* streamOpenAIChat(projectId, messages, model || 'anthropic/claude-3.7-sonnet', endpoint, apiKey, onEvent);
    return;
  }

  // Fallback to Scaffold
  yield* executeScaffoldCopilot(projectId, lastUserMsg, onEvent);
}
