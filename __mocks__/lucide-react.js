import React from 'react';

const MockIcon = React.forwardRef(({ ...props }, ref) => (
  <svg ref={ref} {...props} />
));

MockIcon.displayName = 'Icon';

module.exports = {
  AlertCircle: MockIcon,
  AlertTriangle: MockIcon,
  ChevronDown: MockIcon,
  ChevronRight: MockIcon,
  ChevronUp: MockIcon,
  Eye: MockIcon,
  EyeOff: MockIcon,
  Camera: MockIcon,
  CameraOff: MockIcon,
  Code: MockIcon,
  Copy: MockIcon,
  FileText: MockIcon,
  Flower2: MockIcon,
  Loader2: MockIcon,
  Menu: MockIcon,
  MessageCircle: MockIcon,
  Plus: MockIcon,
  Search: MockIcon,
  ScanEye: MockIcon,
  Settings: MockIcon,
  Shield: MockIcon,
  Stethoscope: MockIcon,
  SwitchCamera: MockIcon,
  Trash2: MockIcon,
  X: MockIcon,
};
