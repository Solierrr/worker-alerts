# Changelog

## [0.3.0](https://github.com/Solierrr/worker-alerts/compare/v0.2.0...v0.3.0) (2026-11-02)


### Features

* add the heartbeat and the probe with a cron trigger ([#9](https://github.com/Solierrr/worker-alerts/issues/9)) ([d069f5e](https://github.com/Solierrr/worker-alerts/commit/d069f5eb39acab7a874fd79a4b95ac9c9a443883))
* build the alert routing from the alerts file of each service ([4e72255](https://github.com/Solierrr/worker-alerts/commit/4e72255eccd8d92ca2638a2651038d92c964e998))
* probe the api-email health through its public address ([#15](https://github.com/Solierrr/worker-alerts/issues/15)) ([c0abe5e](https://github.com/Solierrr/worker-alerts/commit/c0abe5ea1f9f9e2b68c9a8d79acf0ab8bb0dc533))
* receive grafana webhooks and manage jira incidents ([#1](https://github.com/Solierrr/worker-alerts/issues/1)) ([88cd404](https://github.com/Solierrr/worker-alerts/commit/88cd404e20ef38660edf594b4a7ff1f44be7d7c8))
* route incidents to the jira space of each service ([#4](https://github.com/Solierrr/worker-alerts/issues/4)) ([36f0ddb](https://github.com/Solierrr/worker-alerts/commit/36f0ddb4a49940676292f7735f161b4207d308ab))
* route mcp-database and database-bootstrap to the database space ([13d0275](https://github.com/Solierrr/worker-alerts/commit/13d02755bdb40e91826f817b381847f0d95bda6a))
* send the operational alert e-mail through the api-email ([#12](https://github.com/Solierrr/worker-alerts/issues/12)) ([762d90b](https://github.com/Solierrr/worker-alerts/commit/762d90bc1468e76db9f76fbe5099eb98b71b19e5))
* send the operational alert to a Telegram channel ([#19](https://github.com/Solierrr/worker-alerts/issues/19)) ([8de643a](https://github.com/Solierrr/worker-alerts/commit/8de643ac5c1d68a47d2d3d3517c706012e06e4ae))
* show the heartbeat age in the monitor report ([#10](https://github.com/Solierrr/worker-alerts/issues/10)) ([7f8c73e](https://github.com/Solierrr/worker-alerts/commit/7f8c73e0de592ea3b33d0ad239eb88b864dcbf3e))
* silence the no data alert while the cluster is paused ([#11](https://github.com/Solierrr/worker-alerts/issues/11)) ([da6cd19](https://github.com/Solierrr/worker-alerts/commit/da6cd19cb51227fa04a60c33f0cbea9cc2cfa960))


### Bug Fixes

* name the network error when the jira call fails ([#7](https://github.com/Solierrr/worker-alerts/issues/7)) ([9ea69f1](https://github.com/Solierrr/worker-alerts/commit/9ea69f1ba91b4485f2250efba102ce5b34d983d4))
* report why the jira call failed in the webhook response ([#6](https://github.com/Solierrr/worker-alerts/issues/6)) ([9c96038](https://github.com/Solierrr/worker-alerts/commit/9c96038c44490e9c8f62c650f3bba24ec041e835))
* route the telemetry names that exist in production ([#5](https://github.com/Solierrr/worker-alerts/issues/5)) ([f0b9911](https://github.com/Solierrr/worker-alerts/commit/f0b9911a1365a305de3cdae818ecd215af8502c6))
* send the full service name and the summary without the service prefix ([#14](https://github.com/Solierrr/worker-alerts/issues/14)) ([1b3db33](https://github.com/Solierrr/worker-alerts/commit/1b3db337c8b271025a140c228280b6585eccc4f9))
* send the service link in the alert e-mail and stop sending the steps ([#13](https://github.com/Solierrr/worker-alerts/issues/13)) ([465c85f](https://github.com/Solierrr/worker-alerts/commit/465c85f500bd861609c80557a73c83ddd76ac623))
* use manual redirects, the only blocking mode workers support ([#8](https://github.com/Solierrr/worker-alerts/issues/8)) ([7ac2cb0](https://github.com/Solierrr/worker-alerts/commit/7ac2cb0915579b635ec5a1bf5f75ef66e4788ae4))

## [0.2.0](https://github.com/Solierrr/generic-template/compare/v0.1.1...v0.2.0) (2026-10-02)


### Features

* add practical bruno api examples ([5382018](https://github.com/Solierrr/generic-template/commit/5382018aa456fa7a07293aaa7b6228478ba187cb))
* add runtime and local api templates ([7bfb0d2](https://github.com/Solierrr/generic-template/commit/7bfb0d2fc19840a41b902e8910e4cf224337350b))

## [0.1.1](https://github.com/Solierrr/generic-template/compare/v0.1.0...v0.1.1) (2026-09-30)


### Bug Fixes

* grant pull-requests write permission to release workflow ([2978b14](https://github.com/Solierrr/generic-template/commit/2978b14aeecc63d0283afffeb9e62bc478b02afe))
* trigger releases by command ([86004f2](https://github.com/Solierrr/generic-template/commit/86004f2b2d859bc09993cf98ec3892d497d23e5a))
* use checkbox trigger for qa sync workflow ([f4448db](https://github.com/Solierrr/generic-template/commit/f4448dbef0bd3018db1b188c677f2530e25a38cd))
