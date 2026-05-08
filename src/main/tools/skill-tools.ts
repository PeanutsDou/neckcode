import { getLoadedSkills, getSkill, renderSkillForInvocation } from '../skills/loader';

export const skillHandlers: Record<string, (args: Record<string, unknown>) => string> = {
  list_skills(args) {
    const skills = getLoadedSkills();
    if (skills.length === 0) return 'No skills are currently loaded.';

    const filtered = skills.filter(s => !s.disableModelInvocation);

    return JSON.stringify(
      filtered.map(s => ({
        name: s.name,
        description: s.description,
        whenToUse: s.whenToUse ?? null,
        rootDir: s.rootDir,
        context: s.context,
        argumentHint: s.argumentHint ?? null,
      })),
      null,
      2,
    );
  },

  invoke_skill(args) {
    const skillName = (String(args.skill || '')).replace(/^\//, '');
    if (!skillName) return 'ERROR: "skill" is required.';

    const skill = getSkill(skillName);
    if (!skill) {
      const loaded = getLoadedSkills();
      const available = loaded.map(s => s.name).join(', ');
      return `ERROR: Unknown skill "${skillName}". Available skills: ${available || '(none loaded)'}`;
    }

    if (skill.disableModelInvocation) {
      return `ERROR: Skill "${skillName}" disables model invocation. It can only be invoked by the user via slash command.`;
    }

    const argsStr = typeof args.args === 'string' ? args.args : undefined;
    return renderSkillForInvocation(skill, argsStr);
  },
};
