import { QwenClient, ChatMessage, cleanJson } from "./qwenClient";

export const AGENT_PERSONAS: Record<string, any> = {
  MAESTRO: {
    role: "Orchestrator",
    personality: "Structured, decisive, keeps the creative process moving.",
    capability: "Task planning, agent coordination, final quality review.",
    speaks_to: "all agents",
  },
  LYRA: {
    role: "Lyricist",
    personality: "Poetic, emotionally expressive, defends artistic choices.",
    capability: "Rhyme, meter, storytelling, emotional resonance.",
    conflict: "Disagrees with CHORD on song structure (verse/chorus ratio).",
  },
  CHORD: {
    role: "Music Theorist",
    personality: "Technical, precise, occasionally rigid.",
    capability: "Music theory, harmonic analysis, arrangement structure.",
    conflict: "Disagrees with LYRA on structure, with MIXER on instrumentation.",
  },
  MIXER: {
    role: "Sound Designer",
    personality: "Trendy, experimental, pushes boundaries.",
    capability: "Genre knowledge, production styles, current trends.",
    conflict:
      "Disagrees with CHORD (unconventional chords) and LYRA (rhythm vs lyric).",
  },
  CRITIC: {
    role: "Quality Reviewer",
    personality: "Objective, sometimes harsh, always honest.",
    capability: "Comparative analysis, quality scoring, improvement suggestions.",
    conflict: "None — evaluates all others.",
  },
};

export interface AgentOutput {
  agent: string;
  output: string;
  revisionCount: number;
}

export interface ComposeResult {
  brief: string;
  tasks: any;
  specialistOutputs: Record<string, string>;
  conflicts: any[];
  criticReview: any;
  finalPackage: string;
  iterations: number;
  elapsedSeconds: number;
}

export class BandAI {
  private client: QwenClient;
  private model: string;

  constructor(client?: QwenClient, model = "qwen-plus") {
    this.client = client || new QwenClient();
    this.model = model;
  }

  private agentPrompt(agentName: string, brief: string, extra = ""): string {
    const p = AGENT_PERSONAS[agentName];
    return `You are ${agentName}, a specialist music agent in BandAI.
Role: ${p.role}
Personality: ${p.personality}
Capability: ${p.capability}
${p.conflict ? "Conflict note: " + p.conflict : ""}

Current brief:
${brief}
${extra}

Speak in character. Produce concrete, usable musical output for the current task.`;
  }

  private async runAgent(
    agentName: string,
    task: string,
    brief: string,
    extra = ""
  ): Promise<string> {
    const messages: ChatMessage[] = [
      { role: "system", content: this.agentPrompt(agentName, brief, extra) },
      { role: "user", content: task },
    ];
    return this.client.chat({ messages, model: this.model, temperature: 0.7 });
  }

  async decompose(brief: string): Promise<any> {
    const task = `Decompose the creative brief into clear tasks for LYRA, CHORD, MIXER and CRITIC.
Return JSON:
{
  "tasks": {
    "LYRA": "...",
    "CHORD": "...",
    "MIXER": "...",
    "CRITIC": "..."
  }
}`;
    const content = await this.runAgent("MAESTRO", task, brief);
    try {
      return JSON.parse(cleanJson(content));
    } catch {
      return {};
    }
  }

  async runSpecialists(
    brief: string,
    tasks: Record<string, string>
  ): Promise<Record<string, AgentOutput>> {
    const outputs: Record<string, AgentOutput> = {};
    for (const agent of ["LYRA", "CHORD", "MIXER"]) {
      const raw = await this.runAgent(agent, tasks[agent] || brief, brief);
      outputs[agent] = { agent, output: raw, revisionCount: 0 };
    }
    return outputs;
  }

  async detectConflicts(
    brief: string,
    outputs: Record<string, AgentOutput>
  ): Promise<any[]> {
    const summary = Object.entries(outputs)
      .map(([name, out]) => `--- ${name} ---\n${out.output}`)
      .join("\n\n");
    const task = `Review these three specialist outputs against the brief. Detect concrete conflicts
(e.g., key vs mood, structure disagreement, instrumentation mismatch). For each conflict,
return a JSON object with the disagreeing agents and a proposed compromise.

Return JSON:
{"conflicts": [{"agents": ["...", "..."], "issue": "...", "proposed_compromise": "..."}]}

Outputs:
${summary}`;
    const critic = await this.runAgent("CRITIC", task, brief);
    try {
      return JSON.parse(cleanJson(critic)).conflicts || [];
    } catch {
      return [];
    }
  }

  async negotiate(
    brief: string,
    outputs: Record<string, AgentOutput>,
    conflicts: any[],
    maxRounds = 3
  ): Promise<Record<string, AgentOutput>> {
    for (let round = 0; round < maxRounds; round++) {
      if (conflicts.length === 0) break;
      for (const conflict of conflicts) {
        const agents: string[] = conflict.agents || [];
        const issue = conflict.issue || "";
        const compromise = conflict.proposed_compromise || "";
        const context = `Conflict: ${issue}\nProposed compromise: ${compromise}\n`;
        for (const agentName of agents) {
          if (!outputs[agentName]) continue;
          const response = await this.runAgent(
            agentName,
            `Respond to this proposed compromise. Accept, reject with reason, or counter-propose.\n${context}`,
            brief,
            outputs[agentName].output
          );
          outputs[agentName].output += `\n\n[Round ${round + 1} response]: ${response}`;
          outputs[agentName].revisionCount += 1;
        }
        const resolution = await this.runAgent(
          "MAESTRO",
          `Resolve this conflict based on the latest agent responses:\n${context}\nAgent responses updated. State the final decision and ask agents to adapt their outputs accordingly.`,
          brief
        );
        for (const agentName of agents) {
          if (outputs[agentName]) {
            outputs[agentName].output += `\n\n[MAESTRO resolution]: ${resolution}`;
          }
        }
      }
      conflicts = await this.detectConflicts(brief, outputs);
    }
    return outputs;
  }

  async review(
    brief: string,
    outputs: Record<string, AgentOutput>
  ): Promise<any> {
    const pkg = Object.entries(outputs)
      .map(([name, out]) => `--- ${name} ---\n${out.output}`)
      .join("\n\n");
    const task = `Score this music package against the brief on: emotional_resonance, structure_quality,
production_fit, overall. Also list one concrete improvement suggestion.

Return JSON:
{"scores": {"emotional_resonance": 0-10, "structure_quality": 0-10, "production_fit": 0-10, "overall": 0-10}, "suggestion": "..."}

Package:
${pkg}`;
    const result = await this.runAgent("CRITIC", task, brief);
    try {
      return JSON.parse(cleanJson(result));
    } catch {
      return { scores: {}, suggestion: result };
    }
  }

  async synthesize(
    brief: string,
    outputs: Record<string, AgentOutput>,
    criticReview: any
  ): Promise<string> {
    const pkg = Object.entries(outputs)
      .map(([name, out]) => `--- ${name} ---\n${out.output}`)
      .join("\n\n");
    const task = `Synthesize the following specialist outputs into a single cohesive song package:
lyrics, chord chart, production notes, and a short demo arrangement description.
Respect the brief and incorporate the critic's suggestion if useful.

Critic scores/suggestion: ${JSON.stringify(criticReview)}

${pkg}`;
    return this.runAgent("MAESTRO", task, brief);
  }

  async compose(brief: string): Promise<ComposeResult> {
    const start = Date.now();
    const tasks = await this.decompose(brief);
    let outputs = await this.runSpecialists(brief, tasks.tasks || {});
    let conflicts = await this.detectConflicts(brief, outputs);
    outputs = await this.negotiate(brief, outputs, conflicts);
    const review = await this.review(brief, outputs);
    const final = await this.synthesize(brief, outputs, review);
    const elapsed = (Date.now() - start) / 1000;
    return {
      brief,
      tasks,
      specialistOutputs: Object.fromEntries(
        Object.entries(outputs).map(([k, v]) => [k, v.output])
      ),
      conflicts,
      criticReview: review,
      finalPackage: final,
      iterations: Object.values(outputs).reduce((sum, o) => sum + o.revisionCount, 0),
      elapsedSeconds: elapsed,
    };
  }

  async singleAgentBaseline(brief: string): Promise<any> {
    const start = Date.now();
    const output = await this.client.chat({
      messages: [
        {
          role: "system",
          content:
            "You are a songwriter and producer. Write a complete song package (lyrics + chords + production notes) for the brief.",
        },
        { role: "user", content: brief },
      ],
      model: this.model,
      temperature: 0.7,
    });
    return {
      brief,
      finalPackage: output,
      elapsedSeconds: (Date.now() - start) / 1000,
    };
  }
}

async function demo() {
  const band = new BandAI();
  const brief =
    "Write a song about starting over after failure. Pop genre. Uplifting tone. 3 minutes.";
  console.log("Running BandAI...");
  const result = await band.compose(brief);
  console.log(
    `\nCompleted in ${result.elapsedSeconds.toFixed(1)}s, iterations: ${result.iterations}`
  );
  console.log("\n--- FINAL PACKAGE ---\n");
  console.log(result.finalPackage);
}

if (require.main === module) {
  demo().catch(console.error);
}
