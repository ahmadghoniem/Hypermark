import {
  annotationModeShortcuts,
  annotationPanelShortcuts,
  annotationToolbarShortcuts,
  annotateSidebarShortcuts,
  commentPopoverShortcuts,
  decisionControlShortcuts,
  createShortcutRegistry,
  createShortcutScopeHook,
  defineShortcutScope,
  documentViewShortcuts,
  goalSetupShortcuts,
  historyShortcuts,
  htmlAnnotateShortcuts,
  imageAnnotatorShortcuts,
  inputMethodShortcuts,
  viewerShortcuts,
  type ShortcutSurface,
} from '@hypermark/ui/shortcuts';

export const planEditorShortcuts = defineShortcutScope({
  id: 'plan-editor',
  title: 'Plan Editor',
  shortcuts: {
    submitPlan: {
      description: 'Approve / Send feedback',
      bindings: ['Mod+Enter'],
      section: 'Actions',
      hint: 'Approves when there are no annotations and sends feedback when there are.',
      displayOrder: 10,
    },
    submitAnnotations: {
      description: 'Done / Send feedback, whichever the header shows',
      bindings: ['Mod+Enter'],
      section: 'Actions',
      hint: 'Fires the adaptive header primary: Done (or Approve in gate mode) with nothing to send, Send Feedback otherwise.',
      displayOrder: 10,
    },
    quickSave: {
      description: 'Download annotations',
      bindings: ['Mod+S'],
      section: 'Actions',
      hint: 'Saves the current annotations to a Markdown file.',
      displayOrder: 20,
    },
    exitPlanDiff: {
      description: 'Close diff view',
      bindings: ['Escape'],
      section: 'Actions',
      hint: 'Available while plan diff is open.',
      displayOrder: 30,
    },
  },
});

export const usePlanEditorShortcuts = createShortcutScopeHook(planEditorShortcuts);

const planReviewEditorSettingsShortcuts = defineShortcutScope({
  id: 'plan-review-editor-settings',
  title: 'Plan Editor',
  shortcuts: {
    submitPlan: planEditorShortcuts.shortcuts.submitPlan,
    quickSave: planEditorShortcuts.shortcuts.quickSave,
    exitPlanDiff: planEditorShortcuts.shortcuts.exitPlanDiff,
  },
});

const annotateEditorSettingsShortcuts = defineShortcutScope({
  id: 'annotate-editor-settings',
  title: 'Annotate Editor',
  shortcuts: {
    submitAnnotations: planEditorShortcuts.shortcuts.submitAnnotations,
    quickSave: planEditorShortcuts.shortcuts.quickSave,
  },
});

const sharedPlanSurfaceShortcuts = [
  documentViewShortcuts,
  inputMethodShortcuts,
  htmlAnnotateShortcuts,
  annotationModeShortcuts,
  annotationToolbarShortcuts,
  viewerShortcuts,
  commentPopoverShortcuts,
  annotationPanelShortcuts,
  imageAnnotatorShortcuts,
  historyShortcuts,
] as const;

export const planReviewSettingsShortcutRegistry = createShortcutRegistry([
  planReviewEditorSettingsShortcuts,
  ...sharedPlanSurfaceShortcuts,
] as const);

export const annotateSettingsShortcutRegistry = createShortcutRegistry([
  annotateEditorSettingsShortcuts,
  annotateSidebarShortcuts,
  decisionControlShortcuts,
  ...sharedPlanSurfaceShortcuts,
] as const);

export const planReviewSurface: ShortcutSurface = {
  slug: 'plan-review',
  title: 'Plan review',
  description: 'Shortcuts surfaced by the plan review UI.',
  registry: planReviewSettingsShortcutRegistry,
};

export const annotateSurface: ShortcutSurface = {
  slug: 'annotate-mode',
  title: 'Annotate mode',
  description: 'Shortcuts surfaced by the standalone annotation UI.',
  registry: annotateSettingsShortcutRegistry,
};

const goalSetupEditorSettingsShortcuts = defineShortcutScope({
  id: 'goal-setup-editor-settings',
  title: 'Goal Setup',
  shortcuts: {
    submitGoalSetup: {
      description: 'Submit answers / facts',
      bindings: ['Mod+Enter'],
      section: 'Actions',
      hint: 'Submits the bundled interview or facts review.',
      displayOrder: 10,
    },
  },
});

export const goalSetupSettingsShortcutRegistry = createShortcutRegistry([
  goalSetupEditorSettingsShortcuts,
  goalSetupShortcuts,
] as const);

export const goalSetupSurface: ShortcutSurface = {
  slug: 'goal-setup',
  title: 'Goal setup',
  description: 'Shortcuts surfaced by the bundled goal-setup interview and facts review.',
  registry: goalSetupSettingsShortcutRegistry,
};
