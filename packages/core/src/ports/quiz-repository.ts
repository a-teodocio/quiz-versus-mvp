import type { Quiz } from '../quiz/model.js';

/** Where quizzes come from: static JSON assets in production, memory in tests. */
export interface QuizRepository {
  /** The quiz with this id, or undefined when there is none. */
  load(quizId: string): Promise<Quiz | undefined>;
}
