import { italic } from "console-log-colors";
import {
  AgentActionOutputParser,
  AgentExecutor,
  LLMSingleActionAgent,
  Tool,
} from "langchain/agents";
import { LLMChain } from "langchain/chains";
import { BaseLLM } from "langchain/llms/base";
import {
  BasePromptTemplate,
  BaseStringPromptTemplate,
  SerializedBasePromptTemplate,
  renderTemplate,
} from "langchain/prompts";
import {
  AgentAction,
  AgentFinish,
  AgentStep,
  InputValues,
  PartialValues,
} from "langchain/schema";

const PREFIX = `Execute the following task as best you can.
This is what you already know: {context}
You have access to the following tools:`;
const formatInstructions = (toolNames: string) => `Use the following format:

Task: the input task you must accomplish
Thought: you should always think about what to do
Action: the action to take, should be one of [${toolNames}]
Action Input: the input to the action
Observation: the result of the action
... (this Thought/Action/Action Input/Observation can repeat N times)
Thought: I now have the final result
Final Answer: the final result to the original input task`;
const SUFFIX = `Begin!

Task: {input}
Thought:{agent_scratchpad}`;

class CustomPromptTemplate extends BaseStringPromptTemplate {
  tools: Tool[];

  constructor(args: { tools: Tool[]; inputVariables: string[] }) {
    super({ inputVariables: args.inputVariables });
    this.tools = args.tools;
  }

  _getPromptType(): string {
    throw new Error("Not implemented");
  }

  format(input: InputValues): Promise<string> {
    /** Construct the final template */
    const toolStrings = this.tools
      .map((tool) => `${tool.name}: ${tool.description}`)
      .join("\n");
    const toolNames = this.tools.map((tool) => tool.name).join("\n");
    const instructions = formatInstructions(toolNames);
    const template = [PREFIX, toolStrings, instructions, SUFFIX].join("\n\n");
    /** Construct the agent_scratchpad */
    const intermediateSteps = input.intermediate_steps as AgentStep[];
    const agentScratchpad = intermediateSteps.reduce(
      (thoughts, { action, observation }) =>
        thoughts +
        [action.log, `\nObservation: ${observation}`, "Thought:"].join("\n"),
      ""
    );

    console.log(italic("Agent scratchpad: " + agentScratchpad));
    const newInput = { agent_scratchpad: agentScratchpad, ...input };
    /** Format the template. */
    return Promise.resolve(renderTemplate(template, "f-string", newInput));
  }

  partial(_values: PartialValues): Promise<BasePromptTemplate> {
    throw new Error("Not implemented");
  }

  serialize(): SerializedBasePromptTemplate {
    throw new Error("Not implemented");
  }
}

class CustomOutputParser extends AgentActionOutputParser {
  async parse(text: string): Promise<AgentAction | AgentFinish> {
    if (text.includes("Final Answer:")) {
      const parts = text.split("Final Answer:");
      const input = parts[parts.length - 1].trim();
      const finalAnswers = { output: input };
      return { log: text, returnValues: finalAnswers };
    }

    const match = /Action: (.*)\nAction Input: (.*)/s.exec(text);
    if (!match) {
      throw new Error(`Could not parse LLM output: ${text}`);
    }

    return {
      tool: match[1].trim(),
      toolInput: match[2].trim().replace(/^"+|"+$/g, ""),
      log: text,
    };
  }

  getFormatInstructions(): string {
    throw new Error("Not implemented");
  }
}

class CustomAgent {
  tools: Tool[];
  toolsNames: string[];
  executor: AgentExecutor;
  constructor(tools: Tool[], executor: AgentExecutor) {
    this.tools = tools || [];
    this.toolsNames = this.tools.map((t) => t.name);
    this.executor = executor;
  }

  static async fromLLM(llm: BaseLLM, verbose = true, tools: Tool[]): Promise<CustomAgent> {
    const llmChain = new LLMChain({
      prompt: new CustomPromptTemplate({
        tools,
        inputVariables: ["input", "agent_scratchpad", "objective", "context"],
      }),
      llm,
    });

    const agent = new LLMSingleActionAgent({
      llmChain,
      outputParser: new CustomOutputParser(),
      stop: ["\nObservation"],
    });

    const executor = new AgentExecutor({
      agent,
      tools,
    });

    return new CustomAgent(tools, executor);
  }

  async execute(input: string, objective: string, context: string): Promise<string> {
    console.log(`Executing with input "${input}"...`);

    const result = await this.executor.call({
      input,
      objective,
      context
    });

    console.log(`Got output ${result.output}`);
    return result.output;
  }

}

export { CustomAgent };

