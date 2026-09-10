# UCAPSA UX principles

These rules are the product gate for client-facing UX changes. They distill the low-friction usability mindset we want across UCAPSA: make the next action obvious, keep the primary surface simple, and reveal detail only when it is needed.

## The five-second test

A user landing on a screen should be able to answer, without instruction:

1. Where am I?
2. What is the most important thing here?
3. What can I do next?
4. What will happen if I tap the obvious control?

If the interface needs explanatory copy to answer these questions, first try to fix the interface instead of adding more copy.

## General to particular

- Start with the summary or current state.
- Open detail only after the user asks for it.
- Keep frequent actions visible; move rare or administrative choices deeper.
- Do not make the user choose information the app already knows.

Examples:

- One QR scanner recognizes Puppy, Comandos, or Socio. Do not ask the user to choose the QR type first.
- One dog means no dog selector. The selector appears only when there are multiple dogs.
- Home shows current program and recent activity; detailed progress belongs in Perros.

## Reduce decisions, not merely taps

A few obvious taps are better than one ambiguous tap. Every control should have a predictable destination or result. Prefer familiar platform patterns and recognizable symbols over custom interaction rules.

Do not add a card, menu, modal, or tab when an existing destination already owns that job.

## One surface, one job

- Inicio: what matters now.
- Perros: progress and history by dog.
- Clases: training and attendance.
- Pagos: account obligations and payment history.
- Servicios: membership and support.

Cross-cutting actions can live near the context where they are used, but they should not become new sections. QR scanning is an action, not a destination.

## Copy

- Prefer labels that describe the thing or action directly.
- Remove sentences that repeat what the layout already communicates.
- Avoid product-language filler such as “sin perder contexto”, “experiencia integral”, or “acceso rápido” when the user can understand the action without it.
- Guidance should be short and appear at the exact moment it is needed.

## Feedback and offline behavior

- Every important action gets immediate, specific feedback.
- Say what happened: “Asistencia a Comandos registrada”, not “Operación exitosa”.
- Healthy offline-first behavior stays quiet.
- Show “pendiente de sincronizar” only for an action that is actually queued.
- Never present server-authoritative data as confirmed when it is only local.
- Retry and recovery must not risk duplicate writes.

## Progressive disclosure

Do not show controls because they might be useful someday. Show them when the current user and current state make them useful.

Examples:

- Member visits appear only for members.
- Add/rename dog controls stay secondary to the dog’s actual progress.
- Advanced detail lives behind the relevant summary card.

## Accessibility is part of simplicity

- Use comfortable touch targets (48 dp in UCAPSA for primary icon controls).
- Provide accessibility labels for icon-only controls.
- Do not rely on color alone to communicate state.
- Keep contrast and typography readable.

## Usability test loop

For meaningful UX changes, test the task with a small number of representative people before adding explanations. Watch what they do; do not coach them. Record the top problems, fix the largest ones, and test again.

The questions are behavioral:

- Where did they hesitate?
- What did they tap first?
- What did they expect that tap to do?
- What did they fail to notice?
- What did they misunderstand?

Opinions such as “I like it” are secondary to whether the task was completed confidently.

## Pull request gate

Before approving a client UX change, answer yes to all of these:

- Is the screen’s main job obvious?
- Did we remove any unnecessary choice or duplicate path?
- Does the user recognize the control without remembering instructions?
- Is the most frequent action close to the information it affects?
- Is rare detail progressively disclosed?
- Is feedback immediate and specific?
- Does offline behavior preserve trust?
- Can a user recover from a failed action?
- Did we avoid adding a new tab or section when an existing one already owns the job?
- Would a first-time user know what to do without a tutorial?

If any answer is no, the change is not finished.