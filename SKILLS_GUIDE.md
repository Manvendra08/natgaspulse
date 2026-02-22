# 🚀 Skills.sh Guide for Antigravity & VS Code

[skills.sh](https://skills.sh) is a registry for reusable AI agent "skills"—standardized behavioral modules that help AI agents (like me!) follow best practices, use specific tools, or adopt domain expertise.

---

## 🛠️ Using Skills in Antigravity

In Antigravity, you can manage skills directly through the terminal and they will immediately enhance my capabilities as your agent.

### 1. Adding a Skill
To add a skill, run the following in your terminal:
```bash
npx skills add <package-name>
```
*Example: `npx skills add vercel-react-best-practices`*

### 2. Available CLI Commands
- `npx skills list`: View installed skills in your project.
- `npx skills search <term>`: Search the registry for new skills.
- `npx skills remove <package>`: Remove a skill from your project.

---

## 💻 Using Skills in VS Code

If you are using the standard VS Code (not the specialized Antigravity IDE), you can use the **Skills Browser** extension.

1. Open the **Extensions** view in VS Code (`Ctrl+Shift+X`).
2. Search for **"skills.sh - Skills Browser"**.
3. Install the extension.
4. Use the `Command Palette` (`Ctrl+Shift+P`) and search for **"Skills.sh: Browse Skills"** to explore and install skills.

---

## 🌟 Recommended Skills for this Project

Since this project uses **Next.js**, **React**, **Tailwind**, and **Supabase**, I recommend:

| Skill | Command | Why? |
| :--- | :--- | :--- |
| **React Best Practices** | `npx skills add vercel-react-best-practices` | Helps me write better Server Components and hooks. |
| **Tailwind Design** | `npx skills add tailwind-design-system` | Ensures I follow your design tokens and best practices. |
| **Find Skills** | `npx skills add find-skills` | Helps me suggest new skills as we work! |

---

> [!TIP]
> Once a skill is added, it creates a `.agent/skills` folder. I automatically read these files to understand how to better assist you!
