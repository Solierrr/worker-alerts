import { describe, expect, it } from "vitest";
import { alertsConfig } from "../test/support";

const jira = {
  JIRA_BASE_URL: "https://example.atlassian.net/",
  JIRA_USER: "grafana@example.com",
  JIRA_API_TOKEN: "token",
};

describe("config", () => {
  it("uses the defaults when nothing is set", () => {
    expect(alertsConfig()).toMatchObject({
      environment: "prod",
      minIntervalMin: 30,
      maxPer24h: 8,
      logWindowMin: 30,
      jira: undefined,
    });
  });
  it("turns the Jira channel on only when every variable is valid", () => {
    expect(alertsConfig(jira).jira).toMatchObject({
      baseUrl: "https://example.atlassian.net",
      user: "grafana@example.com",
    });
    expect(alertsConfig({ ...jira, JIRA_API_TOKEN: "" }).jira).toBeUndefined();
    expect(
      alertsConfig({ ...jira, JIRA_BASE_URL: "not a url" }).jira,
    ).toBeUndefined();
  });
  it("reads the numeric limits and trims the Grafana URL", () => {
    expect(
      alertsConfig({
        ALERT_MIN_INTERVAL_MIN: "35",
        ALERT_GRAFANA_URL: "https://grafana.example.com/",
      }),
    ).toMatchObject({
      minIntervalMin: 35,
      grafanaUrl: "https://grafana.example.com",
    });
  });
});
