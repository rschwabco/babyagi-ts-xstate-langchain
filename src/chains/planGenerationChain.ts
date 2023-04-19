
import { LLMChain } from "langchain/chains";
import { PromptTemplate } from "langchain";
import { BaseLLM } from "langchain/llms/base";

class PlanGenerationChain extends LLMChain {
  // Chain to generates tasks.

  static fromLLM(llm: BaseLLM, verbose = true): LLMChain {
    // Get the response parser.
    const planGenerationChainTemplate: string =
      " You are an plan creation AI that uses creates a plan for a given objective" +
      " create a numbered list of tasks with the following objective: {objective}," +
      " each task should be a string that is a sentence." +
      " each task should be isolated from the one another. " +
      " Meaning: If a task can be decomposed into several tasks, it should only appear in its decomposed form." +
      " The tasks must have a logical progression, but not be part of one another" +
      " where the result of earlier tasks could be used to inform the next task. " +
      " Define as few tasks as possible to accomplish the task." +
      " Return the tasks as an array.";

    const prompt: PromptTemplate = new PromptTemplate({
      template: planGenerationChainTemplate,
      inputVariables: ["objective"],
    });

    return new PlanGenerationChain({
      prompt: prompt,
      llm: llm,
      verbose: verbose,
    });
  }
}

export { PlanGenerationChain };