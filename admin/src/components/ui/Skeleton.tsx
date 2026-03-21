import React from 'react';

interface TableSkeletonProps {
  columns?: number;
  rows?: number;
}

export const TableSkeleton = ({ columns = 4, rows = 3 }: TableSkeletonProps) => {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="animate-pulse border-b border-gray-100 last:border-none">
          {Array.from({ length: columns }).map((_, j) => (
            <td key={j} className="px-6 py-4">
              <div className="h-4 bg-gray-200 rounded w-3/4 max-w-[200px]"></div>
            </td>
          ))}
        </tr>
      ))}
    </>
  );
};
