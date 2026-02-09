import React from 'react';

const MockIcon = React.forwardRef(({ ...props }, ref) => (
  <svg ref={ref} {...props} />
));

MockIcon.displayName = 'Icon';

module.exports = {
  AlertCircle: MockIcon,
  ChevronDown: MockIcon,
  ChevronRight: MockIcon,
  ChevronUp: MockIcon,
  Code: MockIcon,
  Copy: MockIcon,
  FileText: MockIcon,
  Menu: MockIcon,
  MessageCircle: MockIcon,
  Plus: MockIcon,
  Search: MockIcon,
  Settings: MockIcon,
  Trash2: MockIcon,
  X: MockIcon,
};
