/* eslint-disable max-len */
import { Deque } from "@datastructures-js/deque";
import { bgBlueBright, bgGreenBright, bgRedBright, blue, blueBG, green, red, yellowBright } from "console-log-colors";
import { printTable } from "console-table-printer";
import { config } from "dotenv";
import * as inquirer from "inquirer";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { OpenAI } from "langchain/llms/openai";
import { SerpAPI } from "langchain/tools";
import { Calculator } from "langchain/tools/calculator";
import { WebBrowser } from "langchain/tools/webbrowser";
import { assign, createMachine, interpret } from "xstate";
import { CustomAgent } from "./agents/agent";
import { AnswerGenerationChain } from "./chains/answerGenerationChain";
import { ObjectiveEvaluationChain } from "./chains/objectiveEvaulationChain";
import { PlanGenerationChain } from "./chains/planGenerationChain";
import { RetryTaskChain } from "./chains/retryTaskChain";
import { TaskEvaluationChain } from "./chains/taskEvaluationChain";

config();

const embeddings = new OpenAIEmbeddings();
const model = new OpenAI({ temperature: 0 });
const browser = new WebBrowser({ model, embeddings });



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