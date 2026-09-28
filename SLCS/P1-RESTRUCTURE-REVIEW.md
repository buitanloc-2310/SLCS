# P1 RESTRUCTURE & REVIEW

Build derived from the SFN-SLC-VIPPRO source tree in the supplied archive.

## Implemented
- Classroom sidebar terminology reorganized for Vietnamese learning context; teacher-only areas remain role-gated.
- Calm sky-blue design tokens override the previous multi-color gradient system; classroom and general UI now share one visual direction.

## Structural decision
The returned ZIP uses SFN-SLC-VIPPRO as the only application root. The legacy outer source tree is not duplicated. Migration filenames are left unchanged in this P1 build to avoid silently changing already-applied D1 migration identity.

## Still requires runtime/production testing
P0 join/deep-link, real WebRTC/SFU, camera/mic permissions in in-app browsers, and production secrets cannot be proven by static validation.
