/* eslint-disable max-len */
import { createMachine, assign, interpret, send, raise, Machine } from "xstate";
import { Deque } from "@datastructures-js/deque";
import { color, log, red, green, cyan, cyanBright, yellow, blue, blueBright, bgBlueBright, italic, yellowBright, bgGreenBright, bgRedBright, blueBG } from "console-log-colors";
import * as inquirer from "inquirer";
import { OpenAI } from "langchain/llms/openai";
import { config } from "dotenv";
import { PlanGenerationChain } from "./chains/planGenerationChain";
import { printTable } from "console-table-printer";
import { TaskEvaluationChain } from "./chains/taskEvaluationChain";
import { ObjectiveEvaluationChain } from "./chains/objectiveEvaulationChain";
import { WebBrowser } from "langchain/tools/webbrowser";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
config();

const embeddings = new OpenAIEmbeddings();
const model = new OpenAI({ temperature: 0 });
const browser = new WebBrowser({ model, embeddings });

import {
  ZapierNLAWrapper, RequestsGetTool,
  RequestsPostTool,
  AIPluginTool
} from "langchain/tools";
import { ZapierToolKit } from "langchain/agents";
import { SerpAPI } from "langchain/tools";
import { CustomAgent } from "./agents/agent";
import { Calculator } from "langchain/tools/calculator";
import { RetryTaskChain } from "./chains/retryTaskChain";
import { AnswerGenerationChain } from "./chains/answerGenerationChain";
import { PineconeClient } from "@pinecone-database/pinecone";


interface Task {
  id: string;
  description: string;
  result?: string;
}




interface AgentContext {
  objective: string | null;
  tasks: Deque<Task>;
  completedTasks: Deque<Task>;
  currentTask: Task | null;
}

const machine = createMachine({
  // eslint-disable-next-line max-len
  /** @xstate-layout N4IgpgJg5mDOIC5QEEYDsAuA6AlmnGOAhgDYDEEA9mmLmgG6UDWtMGA8gEYBWYAxoXpgA2gAYAuolAAHSrAI5qUkAA9EAZgAs6rJoAc2gOwAmAGwBOTaMOnNpgDQgAnon3msARkOiArHr3GPj7q6hY+AL7hjqhgmFjSJERo+GhQFNS0eIwsWOhgAE5EGGAAColoYpJIILLyhErVagh65sZYhpbGhh7GHqai6oaGji4Ibp7efgFBIWGR0ejYYCr8AK6EqWVJ6TR02bTLa8UAcssYACpEsEyVyrUKDaBN5i2eph52Ztbm3cPOiIE2j4fqZ1KIPuYfF5DHp5iAYnEwPRSKsimBLtcdpkGMxaHwABb8JgAZVWfD4cFgt2q93qaGUTRabQ6mi6PT6AyGIw0mh8WFMPmMWg+xiFhgiUXhiywSJRaIxTCxe1xWAJRNJ5Mpwg8VRkcge9MaiCZ7U63V6-UGf1GHmsWFFZnF+gdrQlC1iS2RJFRxQVZAK+Uo+XiiQwADMgwBbVWEvgkskU2BUiR3fV0hnG1qm1nmjlW7kIYy+TyaDytXyQ13mOEIz1y31XRXnZDEgDSAH1iQBVADCPYAosTidS9XVFIanpnmWb2Zauf8EOpzDpbXpfKIfsDTBYa9LZd75Y2yM22+2AGLIACSABl+wAREc1NPjjPNLMstkWznWxAeHyafkYXUPQfAGPxeh6SJJTQSgIDgZRa1TMdHlURAAFoHAXNC+XMXC8Pw-D1F3D06AUUgkINV9WQLfRDF0bwPA8PRLX6PQtGIuIEiSFIoAo9MjQQYJTCwURjFw0tggMYxNB-MY9DomTwSYljRDYzQOKWFY+HWPAoC2Ccn2QgymnZACoTBMSfFMMTOQLYC+WYvwTChMTBnUyVaxlL0fXRRs+JfATBWEqEAi0PxQnUKE7PeQDnKFL5gTYjSQySM8iBwEhIH8lCTN6MyPAsyFrPMWyFzLYT5O3AwlzBcxbUMZKuLQHtKEjBIwGKbLjN-PKsHM0SipswYCz0Dx6Lq5dFJAgJTCg8IgA */
  id: "Agent",
  initial: "initial",
  context: {
    objective: null,
    tasks: new Deque<Task>(),
    completedTasks: new Deque<Task>(),
    currentTask: null,
  } as AgentContext,
  states: {
    initial: {
      invoke: {
        id: "getObjective",
        src: "getObjective",
        onDone: {
          actions: assign({
            objective: (_, event) => event.data,
          }),
          target: "planning",
        },
      },
    },
    planning: {
      invoke: {
        id: "generatePlan",
        src: "generatePlan",
        onDone: {
          actions: assign({
            tasks: (_, event) => event.data,
          }),
          target: "executingPlan",
        },
      },
    },
    executingPlan: {
      invoke: {
        id: "executeNextTask",
        src: "executeNextTask",
        onDone: {
          target: "evaluateTask",
          actions: assign({
            currentTask: (context, event) => event.data,
          })
        },
      },
    },
    evaluateTask: {
      invoke: {
        id: "checkSuccess",
        src: "checkSuccess",
        onDone: [
          {
            actions: assign({
              completedTasks: (context) => {
                context.completedTasks.pushBack(context.currentTask);
                return context.completedTasks;
              },
              currentTask: null,
            }),
            cond: (context, event) => event.data.type === "TASK_SUCCESS" && !context.tasks.isEmpty(),
            target: "evaluateObjective",
          },
          {

            actions: assign({
              completedTasks: (context) => {
                context.completedTasks.pushBack(context.currentTask);
                return context.completedTasks;
              },
              currentTask: null,
            }),
            cond: (context, event) => event.data.type === "TASK_SUCCESS" && context.tasks.isEmpty(),
            target: "planComplete",
          },
        ],
        onError: {
          target: "taskFailed",
        },
      },

    },
    evaluateObjective: {
      invoke: {
        id: "checkObjectiveSuccess",
        src: "checkObjeciveSuccess",
        onDone: [
          {
            cond: (context, event) => event.data.type === "OBJECTIVE_INCOMPLETE" && !context.tasks.isEmpty(),
            target: "executingPlan",
          },
          {
            cond: (context, event) => event.data.type === "OBJECTIVE_COMPLETE",
            target: "planComplete"
          },
        ],
      },
    },
    taskFailed: {
      invoke: {
        id: "retryTask",
        src: "retryTask",
        onDone: {
          actions: assign({
            currentTask: (_, event) => event.data,
            tasks: (context, event) => context.tasks.pushFront(event.data),
          }),
          target: "executingPlan"
        },
      }
    },
    planComplete: {

      invoke: {
        src: "generateAnswer",
        onDone: {
          target: "initial",
          actions: assign({
            objective: null,
            tasks: new Deque<Task>(),
            completedTasks: new Deque<Task>(),
            currentTask: null,
          })
        }
      },

    },
  },
  schema: {
    events: {} as
      { type: "GET_OBJECTIVE" } |
      { type: "TASK_DONE" } |
      { type: "TASK_FAILED" } |
      { type: "TASK_SUCCESS" } |
      { type: "ALL_TASKS_DONE" }
  },
  predictableActionArguments: true,
  preserveActionOrder: true,
}, {
  services: {
    getObjective: async () => {
      console.log("Executing getObjective");
      try {
        const answer = await inquirer.prompt([{
          name: "objective",
          message: "What is your objective?",
          type: "input",
        }]) as { objective: string };
        return answer.objective;
      } catch (e) {
        throw Error(`Failed to get objective: ${e}`);
      }
    },
    generatePlan: async (context: AgentContext) => {
      console.log("Executing generatePlan");
      const planGenerationChain = PlanGenerationChain.fromLLM(model, false);
      const tasksRaw = await planGenerationChain.call({ objective: context.objective });
      const tasks = tasksRaw.text.trim().split("\n").map((taskRaw) => {
        const taskParts = taskRaw.split(".");
        return {
          id: taskParts[0],
          description: taskParts.slice(1).join().trim().replaceAll(",", "").replaceAll("\"", "")
        };
      });

      console.log(bgBlueBright("Generated tasks:"));
      printTable(tasks);
      return Deque.fromArray(tasks);
    },
    executeNextTask: async (context: AgentContext) => {
      printTable(context.tasks.toArray());

      const completedTasks = context.completedTasks.toArray();
      const contextArr = completedTasks.map((task) => {
        return `${task.id}. ${task.description}, result: ${task.result}`;
      });
      const task = context.tasks.popFront();
      console.log(bgRedBright("Executing task: " + task?.description));
      const customAgent = await CustomAgent.fromLLM(model, false, [new Calculator(), new SerpAPI(), browser]);

      const result = await customAgent.execute(task.description, context.objective, contextArr.join("\n"));
      console.log(yellowBright(result));

      return { ...task, result };
    },
    checkSuccess: async (context: AgentContext) => {
      const { objective, completedTasks, currentTask } = context;

      const taskEvaluationChain = TaskEvaluationChain.fromLLM(model, false);

      try {
        const taskEvaluation = await taskEvaluationChain.call({
          objective,
          context: completedTasks.toArray().map((task) => {
            return `${task.id}. ${task.description}, result: ${task.result}`;
          }).join("\n"),
          task: currentTask?.description,
          task_result: currentTask?.result,

        });

        console.log(red(taskEvaluation.text));

        const isTaskSucceess = taskEvaluation.text.trim() === "true";
        if (isTaskSucceess) {
          return Promise.resolve({ type: "TASK_SUCCESS" });
        } else {
          return Promise.reject({ type: "TASK_FAILED" });
        }
        console.log(red("Checking task success"), green(taskEvaluation.text));
      } catch (e) {
        console.log(red(`Unable to evaulate task ${e}`));
      }

    },

    checkObjeciveSuccess: async (context: AgentContext) => {
      // Add your logic here to evaluate the task success.
      // For now, it always returns success.
      const { objective, completedTasks } = context;

      const objectiveEvaluationChain = ObjectiveEvaluationChain.fromLLM(model, false);

      try {
        const objectiveEvaluation = await objectiveEvaluationChain.call({
          objective,
          context: completedTasks.toArray().map((task) => {
            return `${task.id}. ${task.description}, result: ${task.result}`;
          }).join("\n"),
        });

        const isObjectiveComplete = objectiveEvaluation.text.trim() === "true";
        if (isObjectiveComplete) {
          console.log(bgGreenBright("Objective complete"));
          return Promise.resolve({ type: "OBJECTIVE_COMPLETE" });
        } else {
          console.log(bgRedBright("Objective incomplete"));
          return Promise.resolve({ type: "OBJECTIVE_INCOMPLETE" });
        }
      } catch (e) {
        console.log(red(`Unable to evaulate task ${e}`));
      }

    },

    retryTask: async (context: AgentContext) => {
      try {
        const retryTaskChain = RetryTaskChain.fromLLM(model, false);
        const { objective, currentTask } = context;

        console.log(blueBG(`CURRENT TASK ${currentTask.result}`));

        const retryResult = await retryTaskChain.call({
          objective,
          task_description: currentTask?.description,
          task_result: currentTask?.result,
        });

        console.log(blue("Retrying task: " + retryResult.text));
        return {
          ...currentTask,
          description: retryResult.text.trim(),
        };

      } catch (e) {
        console.log(red(`Unable to retry task ${e}`));
      }
    },

    generateAnswer: async (context) => {
      const { objective, completedTasks } = context;
      const answerGenerationChain = AnswerGenerationChain.fromLLM(model, false);

      try {
        const finalAnswer = await answerGenerationChain.call({
          objective,
          result: completedTasks.toArray().map((task) => {
            return `${task.id}. ${task.description}, result: ${task.result}`;
          }).join("\n"),
        });

        console.log(bgGreenBright("Final answer:"));
        console.log(finalAnswer.text);
        return finalAnswer.text;
      } catch (e) {
        console.log(red(`Unable to generate answer ${e}`));
      }

    }
  },
  actions: {

  }
});


const service = interpret(machine);
service.start();