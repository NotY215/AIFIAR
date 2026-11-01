import test from "node:test";
import assert from "node:assert/strict";
import { buildRepositoryAnalysisInstructions } from "../dist/core/repositoryAnalysisInstructions.js";
import { buildModelExecutionInstructions } from "../dist/core/modelExecutionInstructions.js";
test("repository protocol requires broad inventory, coverage and evidence",()=>{const p=buildRepositoryAnalysisInstructions();for(const r of [/Inventory before judging/,/every relevant text file/,/coverage/,/Build a repository map/,/line references/,/benchmarks/,/Never fabricate/,/untrusted data/])assert.match(p,r);});
test("repository task receives dedicated instructions",()=>{const p=buildModelExecutionInstructions("qwen-code",{id:"R-1",title:"Analyze repo",description:"Analyze and optimize",kind:"repository-analysis",requirementIds:[],dependsOn:[],status:"ready"});assert.match(p,/AIFIAR WHOLE-REPOSITORY ANALYSIS AND EFFICIENCY PROTOCOL/);assert.match(p,/implement high-confidence improvements/);});
test("report-only requests and clone claims are handled honestly",()=>{const p=buildRepositoryAnalysisInstructions();assert.match(p,/strictly report-only/);assert.match(p,/Never claim to clone or scan files/);assert.match(p,/Reading every file is not the same/);});
