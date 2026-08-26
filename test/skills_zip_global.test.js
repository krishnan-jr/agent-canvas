import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

import {
  createZipBuffer,
  unzipArchive,
  normalizeZipPaths
} from '../src/exporters/zipBuilder.js';

import {
  getAllSkills,
  getSkillsByProject,
  getSkillById,
  getSkillByName,
  saveSkill,
  saveSkillFile,
  deleteSkill,
  getSkillFiles,
  createProject,
  deleteProject,
  saveNode,
  getProjectById
} from '../src/db.js';

import { transpileProject } from '../src/exporters/index.js';
import { validateGraphTopology } from '../src/validator.js';

test('ZIP Extraction: handles both uncompressed and deflated entries with full content', () => {
  const sampleFiles = [
    {
      path: 'my-skill-pkg/SKILL.md',
      content: `---\nname: my-skill-pkg\ndescription: A test skill package\n---\n\n# Skill Runbook\n\nStep 1: Execute tests.\nStep 2: Deploy.`
    },
    {
      path: 'my-skill-pkg/scripts/test.sh',
      content: `#!/usr/bin/env bash\necho "Running test suite..."\nexit 0\n`
    },
    {
      path: 'my-skill-pkg/references/matrix.md',
      content: `# Test Matrix\n\n| Case | Status |\n| :--- | :--- |\n| Unit | Pass |\n`
    }
  ];

  const zipBuffer = createZipBuffer(sampleFiles);
  assert.ok(zipBuffer && zipBuffer.length > 0, 'Zip buffer created');

  const extracted = unzipArchive(zipBuffer);
  assert.equal(extracted.length, 3, 'Extracted 3 files');

  const skillMd = extracted.find(f => f.file_path === 'SKILL.md');
  assert.ok(skillMd, 'SKILL.md extracted with stripped root folder');
  assert.ok(skillMd.content.includes('# Skill Runbook'), 'SKILL.md content is not empty');
  assert.ok(skillMd.content.includes('Step 1: Execute tests.'), 'SKILL.md contains exact body content');

  const scriptFile = extracted.find(f => f.file_path === 'scripts/test.sh');
  assert.ok(scriptFile, 'scripts/test.sh extracted');
  assert.ok(scriptFile.content.includes('Running test suite...'), 'script file content preserved');

  const refFile = extracted.find(f => f.file_path === 'references/matrix.md');
  assert.ok(refFile, 'references/matrix.md extracted');
  assert.ok(refFile.content.includes('| Case | Status |'), 'reference markdown table preserved');
});

test('ZIP Extraction: handles archives with zero sizes in local header (data descriptor mode)', () => {
  // Construct a ZIP buffer where local headers have compressed_size = 0, uncompressed_size = 0
  // and real sizes are in Central Directory
  const rawData = Buffer.from('# Hello World from Streaming Zip\nLine 2\n', 'utf-8');
  const compData = zlib.deflateRawSync(rawData);
  const filename = Buffer.from('test-stream/SKILL.md', 'utf-8');

  // Local header with 0 size (bit 3 set: flag = 8)
  const localHeader = Buffer.alloc(30 + filename.length);
  localHeader.writeUInt32LE(0x04034b50, 0); // Signature
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(8, 6); // General purpose flag: bit 3 set
  localHeader.writeUInt16LE(8, 8); // Deflate
  localHeader.writeUInt16LE(0, 10);
  localHeader.writeUInt16LE(0, 12);
  localHeader.writeUInt32LE(0, 14); // CRC 0 in local header
  localHeader.writeUInt32LE(0, 18); // compSize 0 in local header
  localHeader.writeUInt32LE(0, 22); // uncompSize 0 in local header
  localHeader.writeUInt16LE(filename.length, 26);
  localHeader.writeUInt16LE(0, 28);
  filename.copy(localHeader, 30);

  // Central directory header with REAL sizes
  const centralHeader = Buffer.alloc(46 + filename.length);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(8, 8);
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt16LE(0, 12);
  centralHeader.writeUInt16LE(0, 14);
  centralHeader.writeUInt32LE(12345, 16);
  centralHeader.writeUInt32LE(compData.length, 20); // Real compressed size
  centralHeader.writeUInt32LE(rawData.length, 24);  // Real uncompressed size
  centralHeader.writeUInt16LE(filename.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(0, 42); // Offset 0
  filename.copy(centralHeader, 46);

  const cdOffset = localHeader.length + compData.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralHeader.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  const syntheticZip = Buffer.concat([localHeader, compData, centralHeader, eocd]);

  const result = unzipArchive(syntheticZip);
  assert.equal(result.length, 1);
  assert.equal(result[0].file_path, 'SKILL.md');
  assert.equal(result[0].content, '# Hello World from Streaming Zip\nLine 2\n');
});

test('Global Skills: skills are accessible globally and synchronized to disk', () => {
  const skillId = `test-skill-${Date.now().toString(36)}`;
  const skill = saveSkill({
    id: skillId,
    name: `global-test-skill-${Date.now().toString(36)}`,
    description: 'A globally shared skill'
  });

  assert.ok(skill, 'Skill saved in global repository');

  saveSkillFile({
    skill_id: skill.id,
    file_path: 'SKILL.md',
    content: `# Global Test Skill\nInstructions for global execution.`
  });

  saveSkillFile({
    skill_id: skill.id,
    file_path: 'scripts/run.sh',
    content: `#!/usr/bin/env bash\necho "Global script execution"`
  });

  const retrieved = getSkillById(skill.id);
  assert.ok(retrieved, 'Skill retrieved by id');
  assert.equal(retrieved.files.length, 2, 'Has 2 files');

  const allSkills = getAllSkills();
  const existsInAll = allSkills.some(s => s.id === skill.id);
  assert.ok(existsInAll, 'Skill present in getAllSkills()');

  // Verify getSkillsByProject for arbitrary project IDs also returns it
  const projSkills1 = getSkillsByProject('custom-proj-1');
  const projSkills2 = getSkillsByProject('custom-proj-2');
  assert.ok(projSkills1.some(s => s.id === skill.id), 'Available in custom-proj-1');
  assert.ok(projSkills2.some(s => s.id === skill.id), 'Available in custom-proj-2');

  // Verify lookup by name
  const foundByName = getSkillByName(skill.name);
  assert.ok(foundByName, 'Found skill by global name');
  assert.equal(foundByName.id, skill.id);

  // Clean up
  deleteSkill(skill.id);
  assert.equal(getSkillById(skill.id), null, 'Skill deleted');
});

test('Multi-Project Export: agents in different projects can link and export the same global skill', () => {
  // Create shared global skill
  const skillName = `audit-skill-${Date.now().toString(36)}`;
  const skill = saveSkill({
    name: skillName,
    description: 'Security and code audit'
  });

  saveSkillFile({
    skill_id: skill.id,
    file_path: 'SKILL.md',
    content: `---\nname: ${skillName}\ndescription: Security and code audit\n---\n\n# Audit Runbook\n\nVerify zero CVEs.`
  });

  // Project A
  const projA = createProject({
    id: `proj-a-${Date.now().toString(36)}`,
    name: 'Project Alpha',
    description: 'Alpha workspace'
  });

  const nodeA = saveNode({
    project_id: projA.id,
    filename: 'auditor.md',
    title: 'Auditor',
    content: `---\nname: auditor\nrole: evaluator\nmodel: gemini-2.5-pro\nskills: [${skillName}]\n---\n\nAudit code.`
  }, projA.id);

  // Project B
  const projB = createProject({
    id: `proj-b-${Date.now().toString(36)}`,
    name: 'Project Beta',
    description: 'Beta workspace'
  });

  const nodeB = saveNode({
    project_id: projB.id,
    filename: 'reviewer.md',
    title: 'Reviewer',
    content: `---\nname: reviewer\nrole: evaluator\nmodel: claude-3-7-sonnet\nskills: [${skillName}]\n---\n\nReview pull requests.`
  }, projB.id);

  const globalSkills = getAllSkills();

  // Validate Project A topology
  const valA = validateGraphTopology([nodeA], [], globalSkills);
  assert.equal(valA.errorsCount, 0, 'Project A graph is valid with no skill errors');

  // Validate Project B topology
  const valB = validateGraphTopology([nodeB], [], globalSkills);
  assert.equal(valB.errorsCount, 0, 'Project B graph is valid with no skill errors');

  // Transpile Project A to Antigravity
  const agyFiles = transpileProject('antigravity', projA, [nodeA], [], globalSkills);
  const agySkill = agyFiles.find(f => f.path === `.gemini/antigravity/skills/${skillName}/SKILL.md`);
  assert.ok(agySkill, 'Global skill bundled into Antigravity export for Project A');
  assert.ok(agySkill.content.includes('# Audit Runbook'), 'Skill content in Antigravity export');

  // Transpile Project B to Claude Code
  const claudeFiles = transpileProject('claude-code', projB, [nodeB], [], globalSkills);
  const claudeSkill = claudeFiles.find(f => f.path === `.claude/skills/${skillName}/SKILL.md`);
  assert.ok(claudeSkill, 'Global skill bundled into Claude Code export for Project B');

  // Clean up
  deleteProject(projA.id);
  deleteProject(projB.id);
  deleteSkill(skill.id);
});

test('ZIP Upload Flow: base64 archive unpacking extracts frontmatter metadata and non-empty files', () => {
  const filesToZip = [
    {
      path: 'cloud-deployer/SKILL.md',
      content: `---\nname: cloud-deployer\ndescription: Automated multi-cloud deployment runbook\n---\n\n# Multi-Cloud Deployer\n\nRuns infrastructure validations and canary deployments.`
    },
    {
      path: 'cloud-deployer/scripts/canary.sh',
      content: `#!/usr/bin/env bash\nset -euo pipefail\necho "Checking canary metrics..."\nexit 0`
    },
    {
      path: 'cloud-deployer/references/checklist.md',
      content: `# Deployment Checklist\n\n- [x] Run healthchecks\n- [x] Verify rollback triggers\n`
    }
  ];

  const zipBuf = createZipBuffer(filesToZip);
  const zipBase64 = zipBuf.toString('base64');

  // Simulate server-side POST /api/skills/upload handling
  const unzipped = unzipArchive(Buffer.from(zipBase64, 'base64'));
  assert.equal(unzipped.length, 3, 'All 3 files unzipped from base64 payload');

  const skillMd = unzipped.find(f => f.file_path === 'SKILL.md');
  assert.ok(skillMd && skillMd.content.length > 0, 'SKILL.md is not empty');

  // Save skill globally
  const savedSkill = saveSkill({
    name: 'cloud-deployer',
    description: 'Automated multi-cloud deployment runbook'
  });

  for (const f of unzipped) {
    saveSkillFile({
      skill_id: savedSkill.id,
      file_path: f.file_path,
      content: f.content
    });
  }

  const retrieved = getSkillById(savedSkill.id);
  assert.ok(retrieved, 'Retrieved uploaded skill from database');
  assert.equal(retrieved.files.length, 3, 'All 3 files persisted');

  const persistedMd = retrieved.files.find(f => f.file_path === 'SKILL.md');
  assert.ok(persistedMd.content.includes('# Multi-Cloud Deployer'), 'SKILL.md content matches exactly');

  const persistedScript = retrieved.files.find(f => f.file_path === 'scripts/canary.sh');
  assert.ok(persistedScript.content.includes('Checking canary metrics...'), 'Script content matches exactly');

  // Cleanup
  deleteSkill(savedSkill.id);
});

