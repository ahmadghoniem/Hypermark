import { afterEach, describe, expect, test } from "bun:test";
import { CLASSIC_FAVICON_SVG } from "../core/favicon";
import { normalizeGoalSetupBundle } from "@hypermark/shared/goal-setup";
import { startGoalSetupServer, type GoalSetupServerResult } from "./goal-setup";

let server: GoalSetupServerResult | null = null;

afterEach(() => {
  server?.stop();
  server = null;
});

describe("goal setup server", () => {
  test("serves interview bundle and resolves submitted answers", async () => {
    const bundle = normalizeGoalSetupBundle({
      stage: "interview",
      title: "Goal setup",
      questions: [{ id: "scope", prompt: "Scope?" }],
    });

    server = await startGoalSetupServer({
      bundle,
      htmlContent: "<html></html>",
      origin: "claude-code",
    });

    const plan = await fetch(`${server.url}/api/goal-setup`).then((res) =>
      res.json()
    );
    expect(plan.mode).toBe("goal-setup");
    expect(plan.goalSetup.questions[0].id).toBe("scope");

    // Classic is the sole served favicon, so this route no longer depends on
    // the persisted style -- and therefore no longer varies with whatever
    // ~/.hypermark/config.json happens to say on the machine running this.
    const faviconResponse = await fetch(`${server.url}/favicon.png`);
    expect(faviconResponse.headers.get("content-type")).toBe("image/svg+xml");
    expect(await faviconResponse.text()).toBe(CLASSIC_FAVICON_SVG);

    const decision = server.waitForDecision();
    const submitted = await fetch(`${server.url}/api/goal-setup/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers: [
          {
            questionId: "scope",
            selectedOptionIds: [],
            customAnswer: "",
            answer: "UI, server, and skill text.",
            completed: true,
          },
        ],
      }),
    }).then((res) => res.json());

    expect(submitted.ok).toBe(true);
    const result = await decision;
    expect(result.result?.stage).toBe("interview");
    if (result.result?.stage !== "interview") throw new Error("expected interview");
    expect(result.result.answers[0].answer).toBe("UI, server, and skill text.");
  });
});
