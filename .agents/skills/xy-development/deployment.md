# Deployment conventions

Read when creating, changing, simplifying, or migrating a repository's deployment path. The default for prerelease applications is **push the deployment branch → build once → deploy automatically → report the URL or failure**. Keep the operator's actions and the time spent waiting small.

## Branch names

Use `<environment>[-<component>]-<target>[-<build-mode>]`, with `beta` and `prod` as the usual environments:

| Branch | Delivery route |
| --- | --- |
| `beta-vercel`, `prod-vercel` | Vercel retrieves the selected Git commit, builds it, and deploys it |
| `beta-vercel-prebuilt`, `prod-vercel-prebuilt` | CI builds Vercel Build Output and uploads it with `vercel deploy --prebuilt` |
| `beta-vercel-image`, `prod-vercel-image` | Reserved for an implemented route that deploys an actual CI-built OCI/container image |
| `beta-homelab`, `prod-homelab` | The repository's homelab image/fleet route |
| `beta-fly`, `prod-fly` | Fly deployment |
| `beta-render`, `prod-render` | Render deployment |

The suffix identifies the delivery route. A Dockerfile built by Vercel still uses `-vercel`; `.vercel/output` alone is prebuilt output, not a container image. The name does not configure a provider: checked-in workflows and live branch/environment mappings must implement the named route. Do not invent a route or create branches for unused providers.

When independently deployed components need different revision pointers, put the component before the provider suffix: `prod-app-vercel`, `beta-signer-vercel`, or `beta-legacy-vercel`. Use that qualifier to preserve an existing component's revision when the unqualified branch already belongs to a different deployment; do not overwrite or silently advance either pointer for naming tidiness.

Choose one normal route per environment/target. Deployment branches are pointers to the revisions to run, not separate feature-development histories. Keep normal development on the repository's existing development branches; updating the deployment pointer should not require manufacturing a merge commit or release packet.

Adopt these names when implementing or migrating deployments, including existing `beta`/`prod` branches and prebuilt routes misnamed `-vercel`. If disruption would justify retaining a nonconforming name, present the specific mapping, dependency and proposed exception for **explicit user approval**. Do not silently grandfather it or treat temporary migration state as an approved permanent exception. Existing authorization persists; do not ask again for an action the user already authorized.

## One builder and one automatic path

- For `-vercel`, let Vercel own the deployable build. CI can compile what its tests require, but do not build deployment output in CI only to have Vercel rebuild it.
- For `-vercel-prebuilt`, one branch-triggered CI workflow builds and uploads. Pull the target's project settings when the builder requires them, select beta/production explicitly, use the locked tool versions, and upload the output just built. Build and upload are two technical steps, not two operator ceremonies.
- For `-vercel-image`, implement and verify actual image consumption before claiming the route works. Pin the deployment to the built image's immutable digest.
- Run development validation independently. A routine prerelease deployment does not require waiting for an unrelated `main` workflow, rerunning full qualification, collecting signed receipts, required reviewers, or a separate manual promotion by default.
- A build failure stops that deployment. Add a short automatic post-deploy smoke check where it catches a concrete failure the builder cannot, and show its result with the URL. Do not turn it into another qualification project.
- Retain commit and deployment identity through ordinary platform metadata and CI logs. Additional evidence is justified when it establishes a concrete artifact, protocol or effect requirement; it is not a required hand-authored release packet for every change.
- Keep rollback to a previous deployment/revision straightforward. Let controls follow actual impact; a prerelease holding site does not need enterprise release machinery merely because its environment is named production.

Do not add a generic deployment framework merely to interpret branch names. Prefer the provider's native Git path or the repository's small existing workflow. Do not create duplicate automatic triggers for the same target while simplifying it.

## Migration and scope

Inspect current branch SHAs, workflows, provider mappings, aliases and any GitHub environment/ruleset dependencies before changing a route. Prepare the matching source/configuration changes, preserve the selected revisions, and verify the final mappings and normal trigger. Rename workflow references and deployment documentation with the route; update obsolete repository instructions that the user's requested simplification supersedes.

A naming change does not authorize moving an unrelated feature revision, changing public exposure, publishing packages, or altering custody. Use the user's actual migration/release authorization; branch creation can itself trigger a deployment. Keep any existing homelab fleet, image, admission and rollout behavior intact unless the user separately requests changes to it. A Vercel simplification is not a reason to modify shared homelab gates.

## Compatibility and necessary coordination

Prefer independently deployable components that tolerate the peer versions still active during rollout and rollback. Old browser tabs, queued work and cached clients can outlive a coordinated deployment, so same-commit releases do not remove version skew. Use additive API/data changes, optional fields, sensible unavailable states and safe retries; remove an old contract only after its supported consumers have moved. Do not introduce a general compatibility negotiation system unless a real incompatibility needs it.

Keep an already convenient combined frontend/backend deployment together; independent contracts do not require more services or more pipelines. Coordinate only an operation that needs it, such as a destructive migration, incompatible signed-protocol transition, exclusive signer/resource change or constrained fleet rollout. Preserve its correctness boundary while keeping routine application deployments simple. The [architecture principles](../ariestools-architecture/principles.md#deployment-and-version-skew) explain this boundary.
