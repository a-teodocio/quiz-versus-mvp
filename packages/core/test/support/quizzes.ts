import type { Quiz, QuizEntry, QuizQuestionFields } from '../../src/quiz/model.js';
import type { QuizRepository } from '../../src/ports/quiz-repository.js';

/** Made-up questions in the real schema. Nothing here comes from a real course. */
export function question(id: string, correctText: string, correct = 0): QuizQuestionFields {
  const wrong = ['Wrong one', 'Wrong two', 'Wrong three'];
  const options = [...wrong];
  options.splice(correct, 0, correctText);
  return {
    id,
    question: `Question ${id}?`,
    options,
    correct,
    explanation: `Because ${correctText}.`,
  };
}

export const textEntry = (id: string, correctText = 'Right answer'): QuizEntry => ({
  type: 'text',
  ...question(id, correctText),
});

export const imageEntry = (id: string, imagePath: string): QuizEntry => ({
  type: 'image',
  ...question(id, 'Right picture'),
  image_path: imagePath,
});

export const groupEntry = (id: string, imagePath: string, parts: number): QuizEntry => ({
  type: 'image-group',
  id,
  image_path: imagePath,
  parts: Array.from({ length: parts }, (_, at) =>
    question(`${id}_p${String(at + 1)}`, `Part ${String(at + 1)}`),
  ),
});

export function textQuiz(id: string, count: number): Quiz {
  return {
    id,
    entries: Array.from({ length: count }, (_, at) => textEntry(`${id}_q${String(at + 1)}`)),
  };
}

export function repositoryOf(...quizzes: readonly Quiz[]): QuizRepository {
  const byId = new Map(quizzes.map((quiz) => [quiz.id, quiz]));
  return { load: (quizId) => Promise.resolve(byId.get(quizId)) };
}
