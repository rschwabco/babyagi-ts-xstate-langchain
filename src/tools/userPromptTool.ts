
import { Tool } from "langchain/tools";
import * as inquirer from "inquirer";
class UserPrompt extends Tool {
  name = "userPrompt";

  description =
    // eslint-disable-next-line max-len
    `a user prompting tool. It allows the agent to request the user for information it doesn't have and would best be answered by the user.
    Input should be a clear question to a human being, that can't be answered by other tools.
    This tool should be used as a last resort.`;

  key: string;

  params: Record<string, string>;

  constructor(
    params: Record<string, string> = {}
  ) {
    super();
    this.params = params;
  }

  /** @ignore */
  async _call(prompt: string): Promise<string> {
    const name = "userPrompt";
    const questions = [{
      type: "input",
      name: name,
      message: prompt,
    }];
    const answers = await inquirer.prompt(questions);

    return answers[name];
  }
}

export { UserPrompt };