import re

with open("/Users/jhonatan/Repos/ADScale_2/app/src/components/workspace/BriefingStep.tsx", "r") as f:
    content = f.read()

# 1. Remove motion import
content = content.replace('import { motion } from "framer-motion";\n', '')

# 2. Remove containerVariants and fieldVariants blocks
content = re.sub(
    r'\n// =+\n// Animation variants\n// =+\n\nconst containerVariants = \{[\s\S]*?\};\n\nconst fieldVariants = \{[\s\S]*?\};\n',
    '\n',
    content,
)

# 3. Replace motion.form with form
content = content.replace(
    '<motion.form\n        variants={containerVariants}\n        initial="hidden"\n        animate="show"\n        className="max-w-[720px] mx-auto space-y-5"\n        onSubmit={(e) => e.preventDefault()}>',
    '<form\n        className="max-w-[720px] mx-auto space-y-5"\n        onSubmit={(e) => e.preventDefault()}>'
)
content = content.replace('</motion.form>', '</form>')

# 4. Replace motion.div variants={fieldVariants} with plain div + animate-fade-in + stagger delay
class StaggerReplacer:
    def __init__(self):
        self.idx = 0
        self.stagger_ms = 50
    
    def __call__(self, match):
        attrs = match.group(1)
        delay = self.idx * self.stagger_ms
        self.idx += 1
        # Insert animate-fade-in into className if present
        if 'className="' in attrs:
            attrs = attrs.replace('className="', 'className="animate-fade-in ')
        elif 'className={cn(' in attrs:
            attrs = attrs.replace('className={cn(', 'className={cn("animate-fade-in", ')
        else:
            attrs += ' className="animate-fade-in"'
        if delay > 0:
            attrs += ' style={{ animationDelay: "' + str(delay) + 'ms" }}'
        return '<div' + attrs + '>'

replacer = StaggerReplacer()
content = re.sub(r'<motion\.div variants=\{fieldVariants\}([^>]*)>', replacer, content)

# 5. Replace remaining motion.div with initial/animate/transition
class FadeInReplacer:
    def __call__(self, match):
        attrs = match.group(1)
        # Remove initial, animate, transition, variants props
        attrs = re.sub(r'\s*initial=\{\{[^}]+\}\}', '', attrs)
        attrs = re.sub(r'\s*animate=\{\{[^}]+\}\}', '', attrs)
        attrs = re.sub(r'\s*exit=\{\{[^}]+\}\}', '', attrs)
        attrs = re.sub(r'\s*transition=\{[^}]+\}', '', attrs)
        attrs = re.sub(r'\s*variants=\{[^}]+\}', '', attrs)
        # Add animate-fade-in to className
        if 'className="' in attrs:
            attrs = attrs.replace('className="', 'className="animate-fade-in ')
        elif 'className={cn(' in attrs:
            attrs = attrs.replace('className={cn(', 'className={cn("animate-fade-in", ')
        else:
            attrs += ' className="animate-fade-in"'
        return '<div' + attrs + '>'

fade_in_replacer = FadeInReplacer()
content = re.sub(r'<motion\.div([^>]+)>', fade_in_replacer, content)

# 6. Replace motion.p with p
class PReplacer:
    def __call__(self, match):
        attrs = match.group(1)
        # Remove initial, animate props
        attrs = re.sub(r'\s*initial=\{\{[^}]+\}\}', '', attrs)
        attrs = re.sub(r'\s*animate=\{\{[^}]+\}\}', '', attrs)
        # Add animate-fade-in to className
        if 'className="' in attrs:
            attrs = attrs.replace('className="', 'className="animate-fade-in ')
        elif 'className={cn(' in attrs:
            attrs = attrs.replace('className={cn(', 'className={cn("animate-fade-in", ')
        else:
            attrs += ' className="animate-fade-in"'
        return '<p' + attrs + '>'

p_replacer = PReplacer()
content = re.sub(r'<motion\.p([^>]+)>', p_replacer, content)

# 7. Close tags
content = content.replace('</motion.div>', '</div>')
content = content.replace('</motion.p>', '</p>')

# Clean up double animate-fade-in
content = content.replace('className="animate-fade-in animate-fade-in', 'className="animate-fade-in')
content = content.replace('className={cn("animate-fade-in", "animate-fade-in"', 'className={cn("animate-fade-in"')

# Write back
with open("/Users/jhonatan/Repos/ADScale_2/app/src/components/workspace/BriefingStep.tsx", "w") as f:
    f.write(content)

print("Done")
