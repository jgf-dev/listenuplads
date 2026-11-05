<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

## Runner notes (shared 1-CPU / ~6GB box)

- `vp lint` (and therefore the `.vite-hooks/pre-commit` hook) can panic before analysis with
  `oxc_allocator/src/pool/fixed_size.rs:112: called Result::unwrap() on an Err value: ()`.
  Root cause: with lint `jsPlugins` configured, oxlint's fixed-size allocator path reserves ~6 GiB of
  virtual address space with a plain `MAP_PRIVATE|MAP_ANONYMOUS` mmap (no `MAP_NORESERVE`). Linux
  heuristic overcommit (`vm.overcommit_memory=0`) rejects a single mapping larger than total RAM + swap,
  so on boxes with <6 GiB RAM and no swap this fails deterministically (strace shows `mmap(NULL, 6442455040) = -1 ENOMEM`).
  It is not load- or typeAware-related.
- Fix on this runner: a 2 GiB swapfile at `/swapfile` persisted in `/etc/fstab` makes RAM+swap exceed 6 GiB
  so the reservation succeeds. If the panic reappears, check `swapon --show`; recreate with
  `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` (root, free).

<!--VITE PLUS END-->
