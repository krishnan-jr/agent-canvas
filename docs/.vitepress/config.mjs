import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Agent Canvas',
  description: 'Visual Multi-Agent Orchestrator & Transpiler for Universal Markdown (.md) AI Agents',
  appearance: 'dark',
  lastUpdated: true,
  cleanUrls: true,
  ignoreDeadLinks: 'localhostLinks',

  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap' }]
  ],

  themeConfig: {
    siteTitle: 'Agent Canvas',
    logo: false,

    search: {
      provider: 'local',
      options: {
        detailedView: true
      }
    },

    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'Universal Schema', link: '/schema/universal-schema' },
      { text: 'Exporters', link: '/exporters/' },
      { text: 'Skills', link: '/skills/skills-system' },
      { text: 'MCP Server', link: '/mcp/overview' },
      { text: 'API Reference', link: '/api/rest-endpoints' },
      { text: 'GitHub', link: 'https://github.com/your-org/agent-canvas' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction & Architecture', link: '/guide/introduction' },
            { text: 'Installation & Quick Start', link: '/guide/getting-started' },
            { text: 'Canvas & Visual Editor', link: '/guide/canvas-editor' }
          ]
        }
      ],
      '/schema/': [
        {
          text: 'Universal Schema',
          items: [
            { text: 'Markdown & YAML Specification', link: '/schema/universal-schema' },
            { text: 'Accepted Universal Roles', link: '/schema/roles' }
          ]
        }
      ],
      '/exporters/': [
        {
          text: 'Multi-Target Exporters',
          items: [
            { text: 'Transpilation Overview', link: '/exporters/' },
            { text: 'Claude Code Transpiler', link: '/exporters/claude-code' },
            { text: 'OpenCode Interpreter', link: '/exporters/opencode' },
            { text: 'Cursor Rules (.mdc)', link: '/exporters/cursor' },
            { text: 'Antigravity (AGY)', link: '/exporters/antigravity' },
            { text: 'Codex / OpenAI Assistants', link: '/exporters/codex' },
            { text: 'Universal Raw Runner', link: '/exporters/raw' }
          ]
        }
      ],
      '/skills/': [
        {
          text: 'Modular Skills',
          items: [
            { text: 'Skills Library & Architecture', link: '/skills/skills-system' }
          ]
        }
      ],
      '/mcp/': [
        {
          text: 'Model Context Protocol',
          items: [
            { text: 'Server Architecture & 22 Tools', link: '/mcp/overview' },
            { text: 'Client Connection Guides', link: '/mcp/clients' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'API & Persistence',
          items: [
            { text: 'REST API Endpoints', link: '/api/rest-endpoints' },
            { text: 'SQLite WAL Database Schema', link: '/api/database' }
          ]
        }
      ]
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright 2026 Agent Canvas Team'
    },

    docFooter: {
      prev: 'Previous Page',
      next: 'Next Page'
    }
  }
});
