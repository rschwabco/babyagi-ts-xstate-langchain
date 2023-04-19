/* eslint-disable max-len */
import { LLMChain, PromptTemplate } from "langchain";
import { BaseLLM } from "langchain/llms/base";

class ObjectiveEvaluationChain extends LLMChain {
  // Chain to execute tasks.

  static fromLLM(llm: BaseLLM, verbose = true): LLMChain {
    // Get the response parser.
    const objectiveEvaluationChainTemplate: string =
      " You are an AI who performs a set of tasks based on the following objective: {objective}." +
      " Take into account these previously completed tasks and their results:\n" +
      " {context}\n" +
      " Evaluate whether or not the OBJECTIVE you were given has been FULLY accomplished successfully, based on the these result:." +
      " Respond with one of the following lowercased boolean values: true, false." +
      " Response:";

    const prompt: PromptTemplate = new PromptTemplate({
      template: objectiveEvaluationChainTemplate,
      inputVariables: ["objective", "context"],
    });

    return new ObjectiveEvaluationChain({
      prompt: prompt,
      llm: llm,
      verbose: verbose,
    });
  }
}

export { ObjectiveEvaluationChain };