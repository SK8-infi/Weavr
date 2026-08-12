import { useState } from 'react';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Button from '../common/Button';
import { useRegistry } from '../../context/RegistryContext';

export default function AddPageModal({ isOpen, onClose }) {
  const { addPage } = useRegistry();
  const [title, setTitle] = useState('');
  const [path, setPath] = useState('');

  const handleCreate = () => {
    if (!title || !path) return;
    addPage(title, path);
    setTitle('');
    setPath('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Page Route">
      <div className="space-y-4">
        <Input
          label="Page Title"
          placeholder="e.g. KEYNOTE SPEAKERS"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Input
          label="Route Path"
          placeholder="e.g. /speakers"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleCreate}>
            Create Page
          </Button>
        </div>
      </div>
    </Modal>
  );
}
