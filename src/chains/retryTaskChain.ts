import { LLMChain } from "langchain/chains";
import { PromptTemplate } from "langchain";
import { BaseLLM } from "langchain/llms/base";

class RetryTaskChain extends LLMChain {
  // Chain to generates tasks.

  static fromLLM(llm: BaseLLM, verbose = true): LLMChain {
    // Get the response parser.
    const taskCreationTemplate: string =
      "You are an task creation AI that uses the result of an execution agent" +
      " to create new tasks with the following objective: {objective}," +
      " The last completed task has the result: {task_result}." +
      " This result was based on this task description: {task_description}." +
      " Given the task description and the result the task has FAILED." +
      " MODIFY the task so that it may succeed. It should not be the same as the original task description.";

    const prompt: PromptTemplate = new PromptTemplate({
      template: taskCreationTemplate,
      inputVariables: ["task_result", "task_description", "objective"],
    });

    return new RetryTaskChain({
      prompt: prompt,
      llm: llm,
      verbose: verbose,
    });
  }
}

export { RetryTaskChain };