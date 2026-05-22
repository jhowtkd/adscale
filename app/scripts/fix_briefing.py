import re

with open("/Users/jhonatan/Repos/ADScale_2/app/src/components/workspace/BriefingStep.tsx", "r") as f:
    lines = f.readlines()

# Remove motion import and variant definitions
new_lines = []
skip_until = -1
for i, line in enumerate(lines):
    if i <= skip_until:
        continue
    if 'import { motion } from "framer-motion";' in line:
        continue
    if line.strip() == "// Animation variants":
        skip_until = i + 16  # Skip the variants block (about 16 lines)
        continue
    new_lines.append(line)

lines = new_lines
content = "".join(lines)

# Replace motion.form
content = content.replace(
    '      <motion.form\n        variants={containerVariants}\n        initial="hidden"\n        animate="show"\n        className="max-w-[720px] mx-auto space-y-5"\n        onSubmit={(e) => e.preventDefault()}>',
    '      <form\n        className="max-w-[720px] mx-auto space-y-5"\n        onSubmit={(e) => e.preventDefault()}>'
)
content = content.replace('</motion.form>', '</form>')

# Replace motion.p error messages
content = content.replace(
    '            <motion.p\n              initial={{ opacity: 0, y: -4 }}\n              animate={{ opacity: 1, y: 0 }}\n              className="text-xs text-[var(--accent-rose)] mt-1"\n            >\n              {errors.name}\n            </motion.p>',
    '            <p className="text-xs text-[var(--accent-rose)] mt-1 animate-fade-in">\n              {errors.name}\n            </p>'
)
content = content.replace(
    '            <motion.p\n              initial={{ opacity: 0, y: -4 }}\n              animate={{ opacity: 1, y: 0 }}\n              className="text-xs text-[var(--accent-rose)] mt-1"\n            >\n              {errors.client}\n            </motion.p>',
    '            <p className="text-xs text-[var(--accent-rose)] mt-1 animate-fade-in">\n              {errors.client}\n            </p>'
)
content = content.replace(
    '            <motion.p\n              initial={{ opacity: 0, y: -4 }}\n              animate={{ opacity: 1, y: 0 }}\n              className="text-xs text-[var(--accent-rose)] mt-1"\n            >\n              {errors.ctaVariants}\n            </motion.p>',
    '            <p className="text-xs text-[var(--accent-rose)] mt-1 animate-fade-in">\n              {errors.ctaVariants}\n            </p>'
)

# Replace motion.div with initial/animate/transition (AI Assist badge and form actions)
content = content.replace(
    '      <motion.div\n        initial={{ opacity: 0 }}\n        animate={{ opacity: 1 }}\n        transition={{ delay: 0.5 }}\n        className="fixed bottom-8 right-8 z-30"\n      >',
    '      <div className="fixed bottom-8 right-8 z-30 animate-fade-in" style={{ animationDelay: "500ms" }}>'
)
content = content.replace(
    '      <motion.div\n        initial={{ opacity: 0 }}\n        animate={{ opacity: 1 }}\n        transition={{ delay: 0.4 }}\n        className="max-w-[720px] mx-auto mt-8 flex items-center justify-between"\n      >',
    '      <div className="max-w-[720px] mx-auto mt-8 flex items-center justify-between animate-fade-in" style={{ animationDelay: "400ms" }}>'
)

# Replace motion.div with initial/animate/transition/variants (notes section)
content = content.replace(
    '          <motion.div\n            initial={{ opacity: 0, height: 0 }}\n            animate={{ opacity: 1, height: "auto" }}\n            transition={{ duration: 0.3, ease: [0.4, 0, 0.6, 1] as const }}\n            variants={fieldVariants}\n          >',
    '          <div className="animate-fade-in">'
)

# Replace motion.div with initial/animate/transition (Briefing Doctor section)
content = content.replace(
    '        <motion.div\n          variants={fieldVariants}\n          className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-4 space-y-3"\n        >',
    '        <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-4 space-y-3 animate-fade-in">'
)

# Now handle all remaining motion.div variants={fieldVariants} with stagger delays
# Use a simple counter approach
stagger_idx = 0
STAGGER_MS = 50

# We need to replace multiple patterns. Let's do them in order of appearance.
# Pattern 1: <motion.div variants={fieldVariants}>
# Pattern 2: <motion.div variants={fieldVariants} className="...">

def replace_variants_field(match):
    global stagger_idx
    attrs = match.group(1)
    delay = stagger_idx * STAGGER_MS
    stagger_idx += 1
    
    # Remove variants={fieldVariants}
    attrs = attrs.replace('variants={fieldVariants}', '')
    attrs = attrs.strip()
    
    if 'className="' in attrs:
        attrs = attrs.replace('className="', 'className="animate-fade-in ')
    elif 'className={cn(' in attrs:
        attrs = attrs.replace('className={cn(', 'className={cn("animate-fade-in", ')
    else:
        attrs += ' className="animate-fade-in"'
    
    if delay > 0:
        attrs += ' style={{ animationDelay: "' + str(delay) + 'ms" }}'
    return '<div' + ((' ' + attrs) if attrs else '') + '>'

# Match <motion.div followed by optional space, then anything except >, then >
# But we need to handle single-line only to be safe
content = re.sub(r'<motion\.div variants=\{fieldVariants\}([^>\n]*)>', replace_variants_field, content)

# Write back
with open("/Users/jhonatan/Repos/ADScale_2/app/src/components/workspace/BriefingStep.tsx", "w") as f:
    f.write(content)

print("Done. Replaced", stagger_idx, "motion.div elements with variants.")
