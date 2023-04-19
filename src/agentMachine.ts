/* eslint-disable max-len */
import { Deque } from "@datastructures-js/deque";
import { bgBlueBright, bgGreenBright, bgRedBright, blue, blueBG, green, red, yellowBright } from "console-log-colors";
import { printTable } from "console-table-printer";
import { config } from "dotenv";
import * as inquirer from "inquirer";
import { assign, createMachine, interpret } from "xstate";
import { CustomAgent } from "./agents/agent";
import { AnswerGenerationChain } from "./chains/answerGenerationChain";
import { ObjectiveEvaluationChain } from "./chains/objectiveEvaulationChain";
import { PlanGenerationChain } from "./chains/planGenerationChain";
import { RetryTaskChain } from "./chains/retryTaskChain";
import { TaskEvaluationChain } from "./chains/taskEvaluationChain";
import { AgentContext, Task } from "./types";
import { BaseLLM } from "langchain/llms/base";
import { Tool } from "langchain/tools";

config();


const log = (verbose?: boolean) => (message: string) => {
  if (verbose) {
    console.log(message);
  }
};


class AgentMachine {

  private tools: Tool[];
  private llm: BaseLLM;
  private machine: any;
  constructor(llm: BaseLLM, tools: Tool[], verbose = false) {
    this.machine = createMachine({
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
            onError: {
              target: "taskFailed",
            }
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
            src: "checkObjectiveSuccess",
            onDone: [
              {
                cond: (context, event) => event.data.type === "OBJECTIVE_INCOMPLETE" && !context.tasks.isEmpty(),
                target: "executingPlan",
              },
              {
                cond: (_, event) => event.data.type === "OBJECTIVE_COMPLETE",
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
          log(verbose)(green("Generating plan..."));
          const planGenerationChain = PlanGenerationChain.fromLLM(llm, false);
          const tasksRaw = await planGenerationChain.call({ objective: context.objective });
          const tasks = tasksRaw.text.trim().split("\n").map((taskRaw) => {
            const taskParts = taskRaw.split(".");
            return {
              id: taskParts[0],
              description: taskParts.slice(1).join().trim().replaceAll(",", "").replaceAll("\"", "")
            };
          });

          log(verbose)(bgBlueBright("Generated tasks:"));
          printTable(tasks);
          return Deque.fromArray(tasks);
        },
        executeNextTask: async (context: AgentContext) => {
          try {
            verbose && printTable(context.tasks.toArray());

            const completedTasks = context.completedTasks.toArray();
            const contextArr = completedTasks.map((task) => {
              return `${task.id}. ${task.description}, result: ${task.result}`;
            });
            const task = context.tasks.popFront();
            log(verbose)(bgRedBright("Executing task: " + task?.description));
            const customAgent = await CustomAgent.fromLLM(llm, false, tools);

            const result = await customAgent.execute(task.description, context.objective, contextArr.join("\n"));
            log(verbose)(yellowBright(result));

            return { ...task, result };
          } catch (e) {
            log(true)(`Failed to execute task: ${e}`);
            throw new Error(`Failed to execute task: ${e}`);
          }
        },
        checkSuccess: async (context: AgentContext) => {
          const { objective, completedTasks, currentTask } = context;

          const taskEvaluationChain = TaskEvaluationChain.fromLLM(llm, false);

          try {
            const taskEvaluation = await taskEvaluationChain.call({
              objective,
              context: completedTasks.toArray().map((task) => {
                return `${task.id}. ${task.description}, result: ${task.result}`;
              }).join("\n"),
              task: currentTask?.description,
              task_result: currentTask?.result,

            });

            log(verbose)(`Task succeeded?: ${red(taskEvaluation.text)}`);

            const isTaskSuccess = taskEvaluation.text.trim() === "true";
            if (isTaskSuccess) {
              return Promise.resolve({ type: "TASK_SUCCESS" });
            } else {
              return Promise.reject({ type: "TASK_FAILED" });
            }
          } catch (e) {
            log(true)(red(`Unable to evaluate task ${e}`));
          }
        },

        checkObjectiveSuccess: async (context: AgentContext) => {
          // Add your logic here to evaluate the task success.
          // For now, it always returns success.
          const { objective, completedTasks } = context;

          const objectiveEvaluationChain = ObjectiveEvaluationChain.fromLLM(llm, false);

          try {
            const objectiveEvaluation = await objectiveEvaluationChain.call({
              objective,
              context: completedTasks.toArray().map((task) => {
                return `${task.id}. ${task.description}, result: ${task.result}`;
              }).join("\n"),
            });

            const isObjectiveComplete = objectiveEvaluation.text.trim() === "true";
            if (isObjectiveComplete) {
              log(verbose)(bgGreenBright("Objective complete"));
              return Promise.resolve({ type: "OBJECTIVE_COMPLETE" });
            } else {
              log(verbose)(bgRedBright("Objective incomplete"));
              return Promise.resolve({ type: "OBJECTIVE_INCOMPLETE" });
            }
          } catch (e) {
            log(true)(red(`Unable to evaluate task ${e}`));
          }

        },

        retryTask: async (context: AgentContext) => {
          try {
            const retryTaskChain = RetryTaskChain.fromLLM(llm, false);
            const { objective, currentTask } = context;

            log(verbose)(blueBG(`CURRENT TASK ${currentTask.result}`));

            const retryResult = await retryTaskChain.call({
              objective,
              task_description: currentTask?.description,
              task_result: currentTask?.result,
            });

            log(verbose)(blue("Retrying task: " + retryResult.text));
            return {
              ...currentTask,
              description: retryResult.text.trim(),
            };

          } catch (e) {
            log(true)(red(`Unable to retry task ${e}`));
          }
        },

        generateAnswer: async (context) => {
          const { objective, completedTasks } = context;
          const answerGenerationChain = AnswerGenerationChain.fromLLM(llm, false);

          try {
            const finalAnswer = await answerGenerationChain.call({
              objective,
              result: completedTasks.toArray().map((task) => {
                return `${task.id}. ${task.description}, result: ${task.result}`;
              }).join("\n"),
            });

            log(true)(bgGreenBright("Final answer:"));
            log(true)(finalAnswer.text);
            return finalAnswer.text;
          } catch (e) {
            log(true)(red(`Unable to generate answer ${e}`));
          }
        }
      }
    });
  }

  public async start() {
    const service = interpret(this.machine);
    service.start();
  }
}

export { AgentMachine };