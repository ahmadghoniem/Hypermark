import {
  AnnotationToolstrip,
  type AnnotationToolstripProps,
} from '@hypermark/ui/components/AnnotationToolstrip';

/** Compile-only proof of the published AnnotationToolstrip subpath. */
export function PublishedAnnotationToolstripConsumer(
  props: AnnotationToolstripProps,
) {
  return <AnnotationToolstrip {...props} />;
}
