import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import EventEmitter from 'node:events';

import { eventBus } from '../src/eventBus.js';
import {
  handleDiskFileChange,
  markServerWrite,
  isRecentServerWrite,
  WORKSPACE_DIR,
  getProjectDirPath
} from '../src/fileSync.js';

import {
  createProject,
  deleteProject,
  getNodesByProject,
  getNodeById,
  deleteNode,
  getSkillByName,
  deleteSkill
} from '../src/db.js';

import { executeToolCall } from '../src/mcpServer.js';

test('EventBus: registers clients, sends handshake and formatted SSE broadcasts', () => {
  const messages = [];
  const fakeResponse = new EventEmitter();
  fakeResponse.write = (chunk) => {
    messages.push(chunk);
  };

  eventBus.addClient(fakeResponse);
  assert.ok(messages.length > 0, 'Handshake connection message written');
  assert.ok(messages[0].includes('event: connected'), 'Handshake event name is connected');

  eventBus.broadcast('node_updated', {
    projectId: 'project-default',
    nodeId: 'node-123',
    title: 'Tester'
  });

  const broadcastMsg = messages.find(m => m.includes('event: node_updated'));
  assert.ok(broadcastMsg, 'node_updated event was broadcast');
  assert.ok(broadcastMsg.includes('"nodeId":"node-123"'), 'Contains node details');
  assert.ok(broadcastMsg.includes('"title":"Tester"'), 'Contains payload details');

  // Client disconnect
  fakeResponse.emit('close');
  assert.equal(eventBus.getClientCount(), 0, 'Client removed on close');
});

test('Disk Watcher: external disk file creation and update updates SQLite and broadcasts SSE', async () => {
  const projSlug = `test_live_sync_${Date.now().toString(36)}`;
  const project = createProject({
    name: projSlug,
    description: 'Test live sync project'
  });

  const projectDir = getProjectDirPath(project);
  const agentFilename = 'tester.md';
  const fullFilePath = path.join(projectDir, agentFilename);

  const receivedEvents = [];
  const fakeClient = new EventEmitter();
  fakeClient.write = (chunk) => {
    receivedEvents.push(chunk);
  };
  eventBus.addClient(fakeClient);

  // 1. External disk write (simulating user or editor saving file directly on disk)
  const initialContent = `---\nname: tester\nrole: evaluator\n---\n\n# Tester Agent v1\nInitial content.`;
  fs.writeFileSync(fullFilePath, initialContent, 'utf-8');

  // Process the relative path
  const relPath = `${projSlug}/${agentFilename}`;
  handleDiskFileChange(relPath);

  // Check database
  const nodes = getNodesByProject(project.id);
  const createdNode = nodes.find(n => n.filename === agentFilename);
  assert.ok(createdNode, 'Node created in database from disk file');
  assert.ok(createdNode.content.includes('# Tester Agent v1'), 'Node has disk content');

  const createEvent = receivedEvents.find(e => e.includes('event: graph_updated') && e.includes('node_created'));
  assert.ok(createEvent, 'Broadcast graph_updated node_created on new file');

  // 2. External disk update
  const updatedContent = `---\nname: tester\nrole: evaluator\nskills: [vision-testing]\n---\n\n# Tester Agent v2 (Updated by AI)\nNew responsibilities.`;
  fs.writeFileSync(fullFilePath, updatedContent, 'utf-8');
  handleDiskFileChange(relPath);

  const updatedNodeInDb = getNodeById(createdNode.id);
  assert.ok(updatedNodeInDb.content.includes('# Tester Agent v2'), 'SQLite database content updated from disk');

  const updateEvent = receivedEvents.find(e => e.includes('event: node_updated') && e.includes('Tester Agent v2'));
  assert.ok(updateEvent, 'Broadcast node_updated on disk content change');

  // 3. External disk deletion
  fs.unlinkSync(fullFilePath);
  handleDiskFileChange(relPath);

  const afterDelete = getNodeById(createdNode.id);
  assert.ok(!afterDelete, 'Node deleted from SQLite when removed from disk');

  const deleteEvent = receivedEvents.find(e => e.includes('event: graph_updated') && e.includes('node_deleted'));
  assert.ok(deleteEvent, 'Broadcast graph_updated node_deleted on disk file removal');

  // Clean up
  deleteProject(project.id);
  fakeClient.emit('close');
});

test('MCP Tool Mutations: create_agent and update_agent broadcast live events', async () => {
  const projSlug = `test_mcp_sync_${Date.now().toString(36)}`;
  const project = createProject({
    name: projSlug,
    description: 'Test MCP project'
  });

  const receivedEvents = [];
  const fakeClient = new EventEmitter();
  fakeClient.write = (chunk) => {
    receivedEvents.push(chunk);
  };
  eventBus.addClient(fakeClient);

  // 1. MCP create_agent
  const createResult = await executeToolCall('create_agent', {
    projectId: project.id,
    title: 'Evaluator QA',
    filename: 'evaluator.md',
    role: 'evaluator',
    content: 'Enforce test coverage.'
  });

  assert.ok(createResult.success, 'MCP create_agent succeeded');
  const createBroadcast = receivedEvents.find(e => e.includes('event: graph_updated') && e.includes('Evaluator QA'));
  assert.ok(createBroadcast, 'Live event broadcast when MCP creates agent');

  // 2. MCP update_agent
  const updateResult = await executeToolCall('update_agent', {
    projectId: project.id,
    nodeId: createResult.node.id,
    title: 'Evaluator QA (Enhanced)',
    content: 'Enforce test coverage and visual screenshot inspections.'
  });

  assert.ok(updateResult.success, 'MCP update_agent succeeded');
  const updateBroadcast = receivedEvents.find(e => e.includes('event: node_updated') && e.includes('Evaluator QA (Enhanced)'));
  assert.ok(updateBroadcast, 'Live event broadcast when MCP updates agent');

  // 3. MCP delete_agent
  const deleteResult = await executeToolCall('delete_agent', {
    projectId: project.id,
    nodeId: createResult.node.id
  });

  assert.ok(deleteResult.success, 'MCP delete_agent succeeded');
  const deleteBroadcast = receivedEvents.find(e => e.includes('event: graph_updated') && e.includes('node_deleted'));
  assert.ok(deleteBroadcast, 'Live event broadcast when MCP deletes agent');

  // Clean up
  deleteProject(project.id);
  fakeClient.emit('close');
});
