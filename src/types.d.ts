import { Deque } from "@datastructures-js/deque";

export interface Task {
  id: string;
  description: string;
  result?: string;
}

export interface AgentContext {
  objective: string | null;
  tasks: Deque<Task>;
  completedTasks: Deque<Task>;
  currentTask: Task | null;
  taskRunner: any
}