import { Endpoints } from '@octokit/types';

/** Defines types of arguments needed to be passed to the function */
export type FunctionArgs<F> = F extends (...args: infer T) => any ? T : F extends (...args: infer T) => void ? T : never

export type Unpromisify<P> = P extends Promise<infer U> ? U : P

export type OctokitResult<T extends keyof Endpoints> = Endpoints[T]['response']['data'];
