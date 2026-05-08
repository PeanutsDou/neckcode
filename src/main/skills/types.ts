export interface Skill {
  name: string;
  displayName?: string;
  description: string;
  whenToUse?: string;
  content: string;
  rootDir: string;
  sourceDir: string;
  allowedTools?: string[];
  argumentHint?: string;
  argumentNames?: string[];
  model?: string;
  context: 'inline' | 'fork';
  agent?: string;
  effort?: string;
  version?: string;
  userInvocable: boolean;
  disableModelInvocation: boolean;
}
