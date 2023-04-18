import { createMachine, assign, interpret, send, raise } from "xstate";
import { Deque } from "@datastructures-js/deque";
import { sendTo } from "xstate/lib/actions";
import { color, log, red, green, cyan, cyanBright } from "console-log-colors";

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
            tasks: (context, event) => event.data,
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
            target: "executingPlan",
            cond: (context, event) => !context.tasks.isEmpty(),

          },
          { target: "planComplete" },
        ],
        onError: {
          target: "planFailed",
        },
      },
    },
    checkTaskSuccess: {
      invoke: {
        src: "checkSuccess",
      },
      on: {
        TASK_SUCCESS: {
          target: "executingPlan",
          actions: assign({
            completedTasks: (context, event) => {
              context.completedTasks.pushBack(context.currentTask);
              return context.completedTasks;
            },
            currentTask: null,
          }),
        },
        TASK_FAILED: {
          target: "planFailed",
        },
      },
    },

    planFailed: {},
    planComplete: {
      type: "final",
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
      return { type: "GET_OBJECTIVE" };
    },
    generatePlan: async () => {
      console.log("Executing generatePlan");
      return Deque.fromArray([{ id: "1", description: "task 1" }, { id: "2", description: "task 2" }]);
    },
    executeNextTask: (context: AgentContext) => {
      return new Promise((resolve, reject) => {
        const task = context.tasks.popFront();
        console.log(green("Executing task: " + task?.description));
        // Execute the task and return the result
        resolve(task);
      });
    },
    checkSuccess: async (context: AgentContext) => {
      // Add your logic here to evaluate the task success.
      // For now, it always returns success.
      const isSuccess = true;

      if (isSuccess) {
        send({ type: "TASK_SUCCESS" });
      } else {
        send({ type: "TASK_FAILED" });
      }
    },
  },
});


const service = interpret(machine).onTransition((state) => {
  console.log(state.value);
});

service.start();