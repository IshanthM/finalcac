#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
printf '#!/usr/bin/env bash\nexec bash scripts/check-secrets.sh\n' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit scripts/check-secrets.sh
echo "pre-commit secret check installed"
