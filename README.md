# agent-code

A modern Node.js application built with TypeScript and ES Modules.

## Features

- **Runtime**: Node.js (v20+ / v22+ / v26+)
- **Language**: TypeScript (Strict mode, ES2022 target)
- **Module System**: Pure ES Modules (`"type": "module"`)
- **Development**: Fast execution & watch mode powered by `tsx`
- **Testing**: Built-in Node.js test runner (`node --test`)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Available Scripts

- **`npm run dev`**: Start the development server with live reload (`tsx watch src/index.ts`).
- **`npm run build`**: Compile TypeScript source files to JavaScript in `dist/`.
- **`npm start`**: Run the production build (`dist/index.js`).
- **`npm test`**: Run automated test suites with the native Node.js test runner.

## Project Structure

```
.
├── src/
│   └── index.ts        # Main application entry point
├── .env.example        # Sample environment variables
├── .gitignore          # Git ignore rules
├── package.json        # Project metadata and dependencies
├── tsconfig.json       # TypeScript configuration
└── README.md           # Project documentation
```
