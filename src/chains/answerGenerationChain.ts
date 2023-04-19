import { LLMChain, PromptTemplate } from "langchain";
import { BaseLLM } from "langchain/llms/base";

class AnswerGenerationChain extends LLMChain {
  // Chain to execute tasks.

  static fromLLM(llm: BaseLLM, verbose = true): LLMChain {
    // Get the response parser.
    const answerGenerationTemplate: string =
      " You are an AI who performs one task based on the following objective: {objective}." +
      " Based on the following results, create a well formatted and thoughtful response in Markdown format." +
      " The heading should be the title, the results should be a numbered list." +
      " You should have headings for the result and the explanation." +
      " {result}." +
      " Explain how you arrived at the final answer, and how it accomplished the objective" +
      " Response:";

    const prompt: PromptTemplate = new PromptTemplate({
      template: answerGenerationTemplate,
      inputVariables: ["objective", "result"],
    });

    return new AnswerGenerationChain({
      prompt: prompt,
      llm: llm,
      verbose: verbose,
    });
  }
}

export { AnswerGenerationChain };