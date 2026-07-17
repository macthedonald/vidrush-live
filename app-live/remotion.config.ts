// Remotion CLI / Studio configuration. Used by `remotion studio`, `remotion render`, and
// `remotion lambda sites create` (which bundles the entry point below). Codec and image
// format are set per-render (CLI flags / the Lambda call in lib/remotion/lambda.ts).
import { Config } from '@remotion/cli/config'

// Remote footage is fetched over the network while rendering — give <Img>/<Video> room.
Config.setDelayRenderTimeoutInMilliseconds(60_000)
Config.setEntryPoint('./remotion/index.ts')
