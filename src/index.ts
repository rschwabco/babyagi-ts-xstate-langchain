import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { OpenAI } from "langchain/llms/openai";
import { SerpAPI, Tool } from "langchain/tools";
import { Calculator } from "langchain/tools/calculator";
import { UserPrompt } from "./tools/userPromptTool";
import { AgentMachine } from "./agentMachine";

// Create the agent machine.
const model = new OpenAI({ temperature: 0 });
const tools: Tool[] = [new Calculator(), new SerpAPI(), new UserPrompt()];
const agentMachine = new AgentMachine(model, tools, true);

const main = async () => {
  // Start the agent machine.
  await agentMachine.start();
};

main();


