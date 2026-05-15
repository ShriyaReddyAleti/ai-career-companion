import re


class SkillGapAnalyzer:
    """Analyzes gaps between user skills and job requirements."""

    ROLE_SKILL_REQUIREMENTS = {
        "software engineer": [
            "python", "java", "javascript", "sql", "git", "linux",
            "data structures", "algorithms", "system design", "rest apis", "docker", "postgresql",
        ],
        "frontend engineer": [
            "javascript", "typescript", "react", "html", "css", "next.js",
            "git", "rest apis", "responsive design", "webpack", "testing",
        ],
        "backend engineer": [
            "python", "java", "node.js", "sql", "postgresql", "redis",
            "rest apis", "docker", "kubernetes", "system design", "git", "linux",
        ],
        "full stack engineer": [
            "javascript", "typescript", "react", "node.js", "sql", "postgresql",
            "rest apis", "docker", "git", "testing", "css", "redis",
        ],
        "data scientist": [
            "python", "sql", "machine learning", "pandas", "numpy",
            "tensorflow", "pytorch", "data visualization", "statistics",
        ],
        "ml engineer": [
            "python", "machine learning", "deep learning", "tensorflow", "pytorch",
            "sql", "docker", "kubernetes", "nlp", "git",
        ],
        "devops / sre engineer": [
            "docker", "kubernetes", "aws", "terraform", "ansible",
            "ci/cd", "linux", "python", "git", "jenkins",
        ],
        "data engineer": [
            "python", "sql", "spark", "airflow", "kafka",
            "aws", "postgresql", "mongodb", "git", "docker",
        ],
        "cloud engineer": [
            "aws", "azure", "gcp", "terraform", "kubernetes",
            "docker", "python", "linux", "git",
        ],
        "android engineer": [
            "kotlin", "java", "android sdk", "rest apis", "git",
            "testing", "mvvm", "jetpack compose", "firebase", "sql",
        ],
        "ios engineer": [
            "swift", "xcode", "ios sdk", "rest apis", "git",
            "testing", "swiftui", "core data", "objective-c",
        ],
        "product manager": [
            "agile", "scrum", "jira", "sql", "product roadmap",
            "user stories", "data analysis", "a/b testing", "stakeholder management",
        ],
    }

    # Skill importance by category
    SKILL_CATEGORIES = {
        "languages": ["python", "java", "javascript", "typescript", "c++", "c#", "go", "rust", "ruby", "swift", "kotlin", "php", "sql", "r"],
        "frameworks": ["react", "angular", "vue", "next.js", "node.js", "express", "django", "flask", "fastapi", "spring", "spring boot", ".net"],
        "databases": ["postgresql", "mysql", "mongodb", "redis", "elasticsearch", "dynamodb", "cassandra", "sqlite"],
        "cloud": ["aws", "azure", "gcp", "google cloud", "heroku", "vercel", "docker", "kubernetes"],
        "tools": ["git", "github", "jira", "jenkins", "ci/cd", "terraform", "ansible", "linux", "agile", "scrum"],
        "ml_ai": ["machine learning", "deep learning", "tensorflow", "pytorch", "nlp", "computer vision", "pandas", "numpy"],
    }

    def analyze(
        self,
        user_skills: list[str],
        target_job_skills: list[str] = None,
        target_job_title: str = "",
        target_job_description: str = "",
    ) -> dict:
        """Analyze skill gaps between user and target job."""

        user_skill_set = set(s.lower().strip() for s in user_skills)

        # Get target skills from explicit list or extract from description
        if target_job_skills:
            target_skill_set = set(s.lower().strip() for s in target_job_skills)
        else:
            target_skill_set = self._extract_skills_from_text(target_job_description)

        # Find gaps and matches
        strong_matches = sorted(list(user_skill_set & target_skill_set))
        gap_skills = target_skill_set - user_skill_set

        # Score gaps by priority
        gaps = []
        for skill in gap_skills:
            category = self._get_category(skill)
            priority = self._get_priority(skill, target_job_description)
            gaps.append({
                "skill": skill,
                "priority": priority,
                "category": category,
                "frequency": 1,
            })

        # Sort: high priority first, then medium, then low
        priority_order = {"high": 0, "medium": 1, "low": 2}
        gaps.sort(key=lambda x: priority_order.get(x["priority"], 1))

        # Calculate match percentage
        total = len(target_skill_set) if target_skill_set else 1
        match_pct = len(strong_matches) / total * 100

        # Generate summary
        summary = self._generate_summary(match_pct, gaps, strong_matches, target_job_title)

        return {
            "gaps": gaps,
            "strong_matches": strong_matches,
            "match_percentage": round(match_pct, 1),
            "summary": summary,
        }

    def _extract_skills_from_text(self, text: str) -> set:
        """Extract skills from job description text."""
        if not text:
            return set()

        text_lower = text.lower()
        found = set()

        for category, skills in self.SKILL_CATEGORIES.items():
            for skill in skills:
                pattern = r"\b" + re.escape(skill) + r"\b"
                if re.search(pattern, text_lower):
                    found.add(skill)

        return found

    def _get_category(self, skill: str) -> str:
        """Get the category of a skill."""
        skill_lower = skill.lower()
        for category, skills in self.SKILL_CATEGORIES.items():
            if skill_lower in skills:
                return category
        return "general"

    def _get_priority(self, skill: str, job_desc: str) -> str:
        """Determine skill priority based on frequency in job description."""
        if not job_desc:
            return "medium"

        count = len(re.findall(re.escape(skill), job_desc.lower()))
        if count >= 3:
            return "high"
        elif count >= 1:
            return "medium"
        else:
            return "low"

    def analyze_for_role(self, user_skills: list[str], target_role: str) -> dict:
        role_key = target_role.lower().strip()
        role_skills = self.ROLE_SKILL_REQUIREMENTS.get(role_key)
        if not role_skills:
            for key in self.ROLE_SKILL_REQUIREMENTS:
                if key in role_key or role_key in key:
                    role_skills = self.ROLE_SKILL_REQUIREMENTS[key]
                    break
        if not role_skills:
            role_skills = self.ROLE_SKILL_REQUIREMENTS["software engineer"]
        return self.analyze(
            user_skills=user_skills,
            target_job_skills=role_skills,
            target_job_title=target_role,
            target_job_description="",
        )

    def _generate_summary(self, match_pct, gaps, matches, job_title) -> str:
        """Generate a human-readable summary."""
        title_str = f" for {job_title}" if job_title else ""

        if match_pct >= 80:
            summary = f"Excellent fit{title_str}! You match {match_pct:.0f}% of required skills."
        elif match_pct >= 60:
            summary = f"Good fit{title_str}. You match {match_pct:.0f}% of required skills."
        elif match_pct >= 40:
            summary = f"Moderate fit{title_str}. You match {match_pct:.0f}% of required skills."
        else:
            summary = f"Developing fit{title_str}. You match {match_pct:.0f}% of required skills."

        high_priority = [g for g in gaps if g["priority"] == "high"]
        if high_priority:
            top_skills = [g["skill"] for g in high_priority[:3]]
            summary += f" Focus on learning: {', '.join(top_skills)}."

        return summary
