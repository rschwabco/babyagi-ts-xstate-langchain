/* eslint-disable max-len */
import { LLMChain, PromptTemplate } from "langchain";
import { BaseLLM } from "langchain/llms/base";

class TaskEvaluationChain extends LLMChain {
  // Chain to execute tasks.

  static fromLLM(llm: BaseLLM, verbose = true): LLMChain {
    // Get the response parser.
    const taskEvaluationChainTemplate: string =
      " You are an AI who performs the following TASK: {task} " +
      " Take into account these previously completed tasks and their results:\n" +
      " {context}\n" +
      " Your task: {task}." +
      " Evaluate whether or not the TASK you were given has been FULLY accomplished successfully, based on the following results:." +
      " {task_result}." +
      " Respond with one of the following lowercased boolean values: true, false" +
      " Response:";

    const prompt: PromptTemplate = new PromptTemplate({
      template: taskEvaluationChainTemplate,
      inputVariables: ["objective", "context", "task", "task_result"],
    });

    return new TaskEvaluationChain({
      prompt: prompt,
      llm: llm,
      verbose: verbose,
    });
  }
}

export { TaskEvaluationChain };